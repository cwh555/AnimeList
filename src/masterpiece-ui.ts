import { Modal, Notice, Setting, TFile } from "obsidian";
import { AnimeListUI } from "./legacy";
import type AnimeListPlugin from "./main";
import { AnimeListSettingTab } from "./settings";
import type { SettingsSection } from "./settings";
import type { MediaItem } from "./types";
import { getScopedMarkdownFiles } from "./vault-scope";
import {
  collectMasterpieceLabels,
  deleteMasterpieceLabel,
  filterBySpecialLabel,
  labelsForMasterpieceEnable,
  normalizeMasterpieceLabel,
  normalizeMasterpieceLabels,
  normalizeSpecialLabelMode,
  renameMasterpieceLabel,
  resolveIndependentFilterState,
  stateAfterFavoriteChange,
  stateAfterMasterpieceSelection,
} from "./masterpiece-labels";
import type { SpecialLabelMode } from "./masterpiece-labels";
import { masterpieceFeatureText, specialLabelName } from "./masterpiece-feature-text";

interface MasterpieceSettings {
  specialLabelMode?: SpecialLabelMode;
}

interface MediaItemWithMasterpiece extends MediaItem {
  masterpieceLabels?: string[];
}

interface LibraryRenderState {
  type?: string;
  status?: string;
  genre?: string;
  query?: string;
  sort?: string;
  view?: string;
}

type MasterpiecePlugin = AnimeListPlugin & {
  settings: AnimeListPlugin["settings"] & MasterpieceSettings;
};

type SettingSectionsMethod = (this: AnimeListSettingTab) => SettingsSection[];

const installedPlugins = new WeakSet<object>();
const installedSettings = new WeakSet<object>();
const installedRenderers = new WeakSet<object>();
const activeFilters = new WeakMap<HTMLElement, boolean>();
const libraryStates = new WeakMap<HTMLElement, LibraryRenderState>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modeOf(plugin: MasterpiecePlugin): SpecialLabelMode {
  return normalizeSpecialLabelMode(plugin.settings.specialLabelMode);
}

function labelsOf(item: MediaItem): string[] {
  return normalizeMasterpieceLabels(Reflect.get(item, "masterpieceLabels"));
}

function labelsFromFrontmatter(frontmatter: Record<string, unknown> | undefined): string[] {
  const labels = normalizeMasterpieceLabels(frontmatter?.masterpiece_labels);
  return frontmatter?.favorite === true && labels.length === 0
    ? labelsForMasterpieceEnable(labels)
    : labels;
}

function runUiAction(action: Promise<void>): void {
  void action.catch((error: unknown) => {
    console.error("AnimeList masterpiece update failed", error);
    new Notice(masterpieceFeatureText("notice.failed"));
  });
}

async function writeState(
  plugin: MasterpiecePlugin,
  path: string,
  favorite: boolean,
  labels: string[],
): Promise<void> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) throw new Error("Media note not found");
  await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
    frontmatter.favorite = favorite;
    if (labels.length) frontmatter.masterpiece_labels = labels;
    else delete frontmatter.masterpiece_labels;
    delete frontmatter.updated_at;
    delete frontmatter.metadata_updated_at;
  });
  plugin.refreshViews();
}

function categoryNames(plugin: MasterpiecePlugin): string[] {
  return collectMasterpieceLabels(plugin.collectMediaItems().map((item) => ({
    favorite: item.favorite,
    masterpieceLabels: labelsOf(item),
  })));
}

class MasterpieceSelectionModal extends Modal {
  private readonly plugin: MasterpiecePlugin;
  private readonly path: string;
  private readonly selected: Set<string>;

  constructor(
    plugin: MasterpiecePlugin,
    path: string,
    favorite: boolean,
    labels: string[],
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.path = path;
    this.selected = new Set(favorite ? labelsForMasterpieceEnable(labels) : labels);
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal");
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: masterpieceFeatureText("modal.title") });
    this.contentEl.createEl("p", { text: masterpieceFeatureText("modal.description") });
    const form = this.contentEl.createDiv({ cls: "al-media-form" });
    const labels = [...new Set([...categoryNames(this.plugin), ...this.selected])]
      .sort((left, right) => left.localeCompare(right, "en"));

    for (const label of labels) {
      const row = form.createEl("label", { cls: "al-form-checkbox" });
      const checkbox = row.createEl("input");
      checkbox.type = "checkbox";
      checkbox.checked = this.selected.has(label);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selected.add(label);
        else this.selected.delete(label);
      });
      row.append(` ${label}`);
    }

    let newLabel = "";
    new Setting(this.contentEl)
      .setName(masterpieceFeatureText("modal.newLabel"))
      .addText((text) => text
        .setPlaceholder(masterpieceFeatureText("modal.newLabelPlaceholder"))
        .onChange((value: string) => {
          newLabel = normalizeMasterpieceLabel(value);
        }));

    const actions = this.contentEl.createDiv({ cls: "al-modal-actions" });
    const remove = actions.createEl("button", {
      cls: "al-delete-button",
      text: masterpieceFeatureText("modal.remove"),
    });
    remove.type = "button";
    remove.addEventListener("click", () => {
      runUiAction(writeState(this.plugin, this.path, false, []).then(() => {
        new Notice(masterpieceFeatureText("notice.removed"));
        this.close();
      }));
    });

    const save = actions.createEl("button", {
      cls: "mod-cta",
      text: masterpieceFeatureText("modal.save"),
    });
    save.type = "button";
    save.addEventListener("click", () => {
      if (newLabel) this.selected.add(newLabel);
      const state = stateAfterMasterpieceSelection([...this.selected]);
      runUiAction(writeState(
        this.plugin,
        this.path,
        state.favorite,
        state.masterpieceLabels,
      ).then(() => {
        new Notice(masterpieceFeatureText("notice.saved"));
        this.close();
      }));
    });
  }
}

async function renameCategory(
  plugin: MasterpiecePlugin,
  previous: string,
  replacement: string,
): Promise<void> {
  const next = normalizeMasterpieceLabel(replacement);
  if (!next) return;
  for (const file of getScopedMarkdownFiles(plugin.app, plugin.getScanFolders())) {
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    const labels = labelsFromFrontmatter(frontmatter);
    const renamed = renameMasterpieceLabel(labels, previous, next);
    if (renamed.join("\n") === labels.join("\n")) continue;
    await plugin.app.fileManager.processFrontMatter(file, (current) => {
      current.masterpiece_labels = renamed;
    });
  }
  plugin.refreshViews();
  new Notice(masterpieceFeatureText("notice.renamed"));
}

async function deleteCategory(plugin: MasterpiecePlugin, target: string): Promise<void> {
  for (const file of getScopedMarkdownFiles(plugin.app, plugin.getScanFolders())) {
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    const labels = labelsFromFrontmatter(frontmatter);
    const remaining = deleteMasterpieceLabel(labels, target);
    if (remaining.length === labels.length) continue;
    await plugin.app.fileManager.processFrontMatter(file, (current) => {
      if (remaining.length) current.masterpiece_labels = remaining;
      else delete current.masterpiece_labels;
      current.favorite = remaining.length > 0;
    });
  }
  plugin.refreshViews();
  new Notice(masterpieceFeatureText("notice.deleted"));
}

function installSettingsIntegration(plugin: MasterpiecePlugin): void {
  const prototype = AnimeListSettingTab.prototype;
  if (installedSettings.has(prototype)) return;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "getSettingSections");
  const original = descriptor?.value as SettingSectionsMethod | undefined;
  if (!original) return;
  installedSettings.add(prototype);

  prototype.getSettingSections = function (): SettingsSection[] {
    const sections = original.call(this);
    const host = this.plugin as MasterpiecePlugin;
    const definitions: SettingsSection["definitions"] = [{
      name: masterpieceFeatureText("settings.mode.name"),
      desc: masterpieceFeatureText("settings.mode.desc"),
      render: (setting) => {
        setting.addDropdown((dropdown) => dropdown
          .addOption("favorite", masterpieceFeatureText("settings.mode.favorite"))
          .addOption("masterpiece", masterpieceFeatureText("settings.mode.masterpiece"))
          .setValue(modeOf(host))
          .onChange(async (value: string) => {
            host.settings.specialLabelMode = normalizeSpecialLabelMode(value);
            await host.saveSettings();
            host.refreshViews();
            this.display();
          }));
      },
    }];

    if (modeOf(host) === "masterpiece") {
      definitions.push({
        name: masterpieceFeatureText("settings.labels.name"),
        desc: masterpieceFeatureText("settings.labels.desc"),
        render: (setting) => {
          const labels = categoryNames(host);
          if (!labels.length) {
            setting.controlEl.createSpan({
              text: masterpieceFeatureText("settings.labels.empty"),
            });
            return;
          }
          const root = setting.controlEl.createDiv();
          for (const label of labels) {
            const row = root.createDiv({ cls: "al-masterpiece-setting-row" });
            const input = row.createEl("input");
            input.type = "text";
            input.value = label;
            const rename = row.createEl("button", {
              text: masterpieceFeatureText("settings.labels.rename"),
            });
            rename.type = "button";
            rename.addEventListener("click", () => {
              runUiAction(renameCategory(host, label, input.value).then(() => this.display()));
            });
            const remove = row.createEl("button", {
              text: masterpieceFeatureText("settings.labels.delete"),
            });
            remove.type = "button";
            remove.addEventListener("click", () => {
              runUiAction(deleteCategory(host, label).then(() => this.display()));
            });
          }
        },
      });
    }

    sections.splice(1, 0, {
      heading: masterpieceFeatureText("settings.heading"),
      definitions,
    });
    return sections;
  };
}

function installPluginAdapters(plugin: MasterpiecePlugin): void {
  const originalCollect = plugin.collectMediaItems.bind(plugin);
  plugin.collectMediaItems = (source?: string): MediaItem[] => originalCollect(source).map((item) => {
    const file = plugin.app.vault.getAbstractFileByPath(item.filePath);
    const frontmatter = file instanceof TFile
      ? plugin.app.metadataCache.getFileCache(file)?.frontmatter
      : undefined;
    const extended: MediaItemWithMasterpiece = {
      ...item,
      masterpieceLabels: labelsFromFrontmatter(frontmatter),
    };
    return extended;
  });

  const originalFavorite = plugin.setFavorite.bind(plugin);
  plugin.setFavorite = async (path: string, next: boolean): Promise<void> => {
    const file = plugin.app.vault.getAbstractFileByPath(path);
    const frontmatter = file instanceof TFile
      ? plugin.app.metadataCache.getFileCache(file)?.frontmatter
      : undefined;
    const labels = labelsFromFrontmatter(frontmatter);
    const favorite = frontmatter?.favorite === true;
    if (modeOf(plugin) === "masterpiece") {
      new MasterpieceSelectionModal(plugin, path, favorite, labels).open();
      return;
    }
    if (next) {
      await originalFavorite(path, true);
      return;
    }
    const state = stateAfterFavoriteChange(labels, false);
    await writeState(plugin, path, state.favorite, state.masterpieceLabels);
  };
}

function installRenderer(plugin: MasterpiecePlugin): void {
  if (installedRenderers.has(AnimeListUI)) return;
  installedRenderers.add(AnimeListUI);
  const original = AnimeListUI.renderLibrary.bind(AnimeListUI);

  AnimeListUI.renderLibrary = (container, inputItems, adapters = {}): void => {
    const active = activeFilters.get(container) === true;
    const items = filterBySpecialLabel(inputItems, active) as MediaItem[];
    const upstreamStateChange = Reflect.get(adapters, "onStateChange");
    const forwardedAdapters = {
      ...adapters,
      initialState: resolveIndependentFilterState(
        libraryStates.get(container),
        Reflect.get(adapters, "initialState") as LibraryRenderState | undefined,
      ),
      onStateChange: (state: LibraryRenderState): void => {
        libraryStates.set(container, state);
        if (typeof upstreamStateChange === "function") upstreamStateChange(state);
      },
    };
    original(container, items, forwardedAdapters);

    const statusBar = container.querySelector(".al-status-bar") as HTMLElement | null;
    if (statusBar?.parentElement) {
      const filterBar = statusBar.parentElement.createDiv({
        cls: "al-status-bar al-special-filter-bar",
      });
      statusBar.after(filterBar);
      const button = filterBar.createEl("button", {
        cls: `al-status-chip al-special-filter-chip${active ? " is-active" : ""}`,
        text: specialLabelName(modeOf(plugin)),
      });
      button.type = "button";
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        activeFilters.set(container, !active);
        AnimeListUI.renderLibrary(container, inputItems, forwardedAdapters);
      });
    }

    const byPath = new Map(items.map((item) => [item.filePath, item]));
    const cards = container.querySelectorAll(".al-card") as NodeListOf<HTMLElement>;
    cards.forEach((card) => {
      const path = card.dataset.path ?? card.getAttribute("data-path") ?? "";
      const item = byPath.get(path) ?? items.find((candidate) => (
        candidate.title === card.querySelector(".al-card-title")?.textContent
      ));
      if (!item) return;
      const favoriteButton = card.querySelector<HTMLElement>(".al-favorite-button");
      if (favoriteButton && modeOf(plugin) === "masterpiece") {
        favoriteButton.title = item.favorite
          ? masterpieceFeatureText("library.editMasterpiece")
          : masterpieceFeatureText("library.addMasterpiece");
        favoriteButton.setAttribute("aria-label", favoriteButton.title);
      }
      if (modeOf(plugin) !== "masterpiece" || !item.favorite) return;
      const labels = labelsForMasterpieceEnable(labelsOf(item));
      let tags = card.querySelector<HTMLElement>(".al-tags");
      if (!tags) {
        tags = card.createDiv({ cls: "al-tags" });
        card.querySelector(".al-progress")?.before(tags);
      }
      for (const label of labels) {
        tags.createSpan({ cls: "al-tag al-masterpiece-tag", text: label });
      }
    });
  };
}

export async function installMasterpieceLabels(plugin: AnimeListPlugin): Promise<void> {
  if (installedPlugins.has(plugin)) return;
  installedPlugins.add(plugin);
  const host = plugin as MasterpiecePlugin;
  const loaded = await host.loadData();
  host.settings.specialLabelMode = normalizeSpecialLabelMode(
    isRecord(loaded) ? loaded.specialLabelMode : undefined,
  );
  installSettingsIntegration(host);
  installPluginAdapters(host);
  installRenderer(host);
}
