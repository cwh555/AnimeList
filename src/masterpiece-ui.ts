import { Modal, Notice, Setting, TFile } from "obsidian";
import type AnimeListPlugin from "./main";
import { registerSettingsSectionExtension } from "./settings";
import type { AnimeListSettingsHost, SettingsSection } from "./settings";
import {
  legacyLibraryRenderer,
  type LibraryRenderAdapters,
} from "./legacy-library-renderer";
import type { MediaItem } from "./types";
import {
  collectMasterpieceLabels,
  labelsForMasterpieceEnable,
  normalizeMasterpieceLabel,
  normalizeMasterpieceLabels,
  normalizeSpecialLabelMode,
  matchesSpecialLabelFilter,
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

interface MasterpiecePlugin extends AnimeListSettingsHost {
  settings: AnimeListSettingsHost["settings"] & MasterpieceSettings;
  collectMediaItems: (source?: string) => MediaItem[];
  setFavorite: (path: string, next: boolean) => Promise<void>;
  getScanFolders: () => string[];
}

const installedPlugins = new WeakSet<object>();
const installedRenderers = new WeakSet<object>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMediaItem(value: unknown): value is MediaItem {
  return isRecord(value)
    && typeof value.filePath === "string"
    && typeof value.title === "string";
}

function modeOf(plugin: MasterpiecePlugin): SpecialLabelMode {
  return normalizeSpecialLabelMode(plugin.settings.specialLabelMode);
}

function labelsOf(item: MediaItem): string[] {
  return normalizeMasterpieceLabels((item as MediaItemWithMasterpiece).masterpieceLabels);
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

function installSettingsIntegration(plugin: MasterpiecePlugin): void {
  registerSettingsSectionExtension("masterpiece-mode", (tab): SettingsSection => {
    const host = tab.plugin as unknown as MasterpiecePlugin;
    return {
      heading: masterpieceFeatureText("settings.heading"),
      definitions: [{
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
              tab.display();
            }));
        },
      }],
    };
  });
  void plugin;
}

function installPluginAdapters(plugin: MasterpiecePlugin): void {
  const originalCollect = plugin.collectMediaItems;
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

  const originalFavorite = plugin.setFavorite;
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
  if (installedRenderers.has(legacyLibraryRenderer)) return;
  installedRenderers.add(legacyLibraryRenderer);
  const original = legacyLibraryRenderer.renderLibrary;

  legacyLibraryRenderer.renderLibrary = (
    container: HTMLElement,
    inputItems: unknown[],
    adapters: LibraryRenderAdapters = {},
  ): void => {
    const upstreamExtraFilters = adapters.extraStatusFilters;
    const upstreamMatcher = adapters.matchesStatusFilter;
    const forwardedAdapters: LibraryRenderAdapters = {
      ...adapters,
      extraStatusFilters: (type: string): Array<[string, string]> => [
        ...(upstreamExtraFilters?.(type) ?? []),
        ["favorite", specialLabelName(modeOf(plugin))],
      ],
      matchesStatusFilter: (item: unknown, filter: string): boolean | undefined => {
        const specialMatch = matchesSpecialLabelFilter(item, filter);
        if (typeof specialMatch === "boolean") return specialMatch;
        return upstreamMatcher?.(item, filter);
      },
    };
    original(container, inputItems, forwardedAdapters);

    const items = inputItems.filter(isMediaItem);
    const byPath = new Map(items.map((item) => [item.filePath, item]));
    const cards = container.querySelectorAll<HTMLElement>(".al-card");
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
  const host = plugin as unknown as MasterpiecePlugin;
  const loaded = await host.loadData();
  host.settings.specialLabelMode = normalizeSpecialLabelMode(
    isRecord(loaded) ? loaded.specialLabelMode : undefined,
  );
  installSettingsIntegration(host);
  installPluginAdapters(host);
  installRenderer(host);
}
