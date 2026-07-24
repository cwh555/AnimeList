/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- This feature adapts the legacy renderer through its public runtime hooks while keeping domain rules typed. */
import { Modal, Notice, Setting, TFile } from "obsidian";
import type AnimeListPlugin from "./main";
import { AnimeListUI } from "./legacy";
import { AnimeListSettingTab } from "./settings";
import { getScopedMarkdownFiles } from "./vault-scope";
import {
  collectMasterpieceLabels,
  deleteMasterpieceLabel,
  labelsForMasterpieceEnable,
  normalizeMasterpieceLabels,
  normalizeSpecialLabelMode,
  renameMasterpieceLabel,
  stateAfterFavoriteChange,
  stateAfterMasterpieceSelection,
} from "./masterpiece-labels";
import type { SpecialLabelMode } from "./masterpiece-labels";
import { masterpieceFeatureText, specialLabelName } from "./masterpiece-feature-text";

interface MasterpieceSettings {
  specialLabelMode?: SpecialLabelMode;
}

interface MasterpieceItem {
  title: string;
  filePath: string;
  favorite: boolean;
  masterpieceLabels: string[];
}

interface MasterpiecePlugin extends AnimeListPlugin {
  settings: AnimeListPlugin["settings"] & MasterpieceSettings;
  collectMediaItems(source?: string): MasterpieceItem[];
  setFavorite(path: string, next: boolean): Promise<void>;
  getScanFolders(): string[];
}

function modeOf(plugin: MasterpiecePlugin): SpecialLabelMode {
  return normalizeSpecialLabelMode(plugin.settings.specialLabelMode);
}

async function writeMasterpieceState(
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

function allCategoryNames(plugin: MasterpiecePlugin): string[] {
  return collectMasterpieceLabels(plugin.collectMediaItems());
}

class MasterpieceSelectionModal extends Modal {
  private readonly plugin: MasterpiecePlugin;
  private readonly path: string;
  private readonly selected: Set<string>;

  constructor(plugin: MasterpiecePlugin, path: string, currentLabels: unknown) {
    super(plugin.app);
    this.plugin = plugin;
    this.path = path;
    this.selected = new Set(labelsForMasterpieceEnable(currentLabels));
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal");
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: masterpieceFeatureText("modal.title") });
    this.contentEl.createEl("p", { text: masterpieceFeatureText("modal.description") });

    const categories = new Set([...allCategoryNames(this.plugin), ...this.selected]);
    const list = this.contentEl.createDiv({ cls: "al-media-form" });
    [...categories].sort((a, b) => a.localeCompare(b, "en")).forEach((label) => {
      const row = list.createEl("label", { cls: "al-form-checkbox" });
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = this.selected.has(label);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selected.add(label);
        else this.selected.delete(label);
      });
      row.append(` ${label}`);
    });

    const newLabel = new Setting(this.contentEl)
      .setName(masterpieceFeatureText("modal.newLabel"))
      .addText((text) => text.setPlaceholder(masterpieceFeatureText("modal.newLabelPlaceholder")));
    const input = newLabel.controlEl.querySelector("input");

    const actions = this.contentEl.createDiv({ cls: "al-modal-actions" });
    const remove = actions.createEl("button", {
      cls: "al-delete-button",
      text: masterpieceFeatureText("modal.remove"),
    });
    remove.addEventListener("click", () => void this.remove());
    const save = actions.createEl("button", {
      cls: "mod-cta",
      text: masterpieceFeatureText("modal.save"),
    });
    save.addEventListener("click", () => {
      const value = input instanceof HTMLInputElement ? valueOrEmpty(input.value) : "";
      if (value) this.selected.add(value);
      void this.save();
    });
  }

  private async save(): Promise<void> {
    const state = stateAfterMasterpieceSelection([...this.selected]);
    await writeMasterpieceState(this.plugin, this.path, state.favorite, state.masterpieceLabels);
    new Notice(masterpieceFeatureText("notice.saved"));
    this.close();
  }

  private async remove(): Promise<void> {
    await writeMasterpieceState(this.plugin, this.path, false, []);
    new Notice(masterpieceFeatureText("notice.removed"));
    this.close();
  }
}

function valueOrEmpty(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

async function renameCategory(
  plugin: MasterpiecePlugin,
  previousLabel: string,
  nextLabel: string,
): Promise<void> {
  const replacement = valueOrEmpty(nextLabel);
  if (!replacement) return;
  for (const file of getScopedMarkdownFiles(plugin.app, plugin.getScanFolders())) {
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    const labels = normalizeMasterpieceLabels(frontmatter?.masterpiece_labels);
    const renamed = renameMasterpieceLabel(labels, previousLabel, replacement);
    if (renamed.join("\n") === labels.join("\n")) continue;
    await plugin.app.fileManager.processFrontMatter(file, (nextFrontmatter) => {
      nextFrontmatter.masterpiece_labels = renamed;
    });
  }
  plugin.refreshViews();
  new Notice(masterpieceFeatureText("notice.renamed"));
}

async function deleteCategory(plugin: MasterpiecePlugin, label: string): Promise<void> {
  for (const file of getScopedMarkdownFiles(plugin.app, plugin.getScanFolders())) {
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    const labels = normalizeMasterpieceLabels(frontmatter?.masterpiece_labels);
    const remaining = deleteMasterpieceLabel(labels, label);
    if (remaining.length === labels.length) continue;
    await plugin.app.fileManager.processFrontMatter(file, (nextFrontmatter) => {
      if (remaining.length) nextFrontmatter.masterpiece_labels = remaining;
      else delete nextFrontmatter.masterpiece_labels;
      nextFrontmatter.favorite = remaining.length > 0;
    });
  }
  plugin.refreshViews();
  new Notice(masterpieceFeatureText("notice.deleted"));
}

let settingsInstalled = false;
function installSettingsSection(): void {
  if (settingsInstalled) return;
  settingsInstalled = true;
  const prototype = AnimeListSettingTab.prototype as any;
  const original = prototype.getSettingSections as () => any[];
  prototype.getSettingSections = function getSettingSectionsWithMasterpiece(): any[] {
    const sections = original.call(this);
    const plugin = this.plugin as MasterpiecePlugin;
    const definitions = [{
      name: masterpieceFeatureText("settings.mode.name"),
      desc: masterpieceFeatureText("settings.mode.desc"),
      render: (setting: Setting) => setting.addDropdown((dropdown) => {
        dropdown
          .addOption("favorite", masterpieceFeatureText("settings.mode.favorite"))
          .addOption("masterpiece", masterpieceFeatureText("settings.mode.masterpiece"))
          .setValue(modeOf(plugin))
          .onChange(async (value) => {
            plugin.settings.specialLabelMode = normalizeSpecialLabelMode(value);
            await plugin.saveSettings();
            plugin.refreshViews();
            this.display();
          });
      }),
    }];

    if (modeOf(plugin) === "masterpiece") {
      definitions.push({
        name: masterpieceFeatureText("settings.labels.name"),
        desc: masterpieceFeatureText("settings.labels.desc"),
        render: (setting: Setting) => {
          const labels = allCategoryNames(plugin);
          if (!labels.length) {
            setting.controlEl.createSpan({ text: masterpieceFeatureText("settings.labels.empty") });
            return;
          }
          const container = setting.controlEl.createDiv();
          labels.forEach((label) => {
            const row = container.createDiv({ cls: "al-masterpiece-setting-row" });
            const input = row.createEl("input", { type: "text", value: label });
            const rename = row.createEl("button", { text: masterpieceFeatureText("settings.labels.rename") });
            rename.addEventListener("click", () => void renameCategory(plugin, label, input.value).then(() => this.display()));
            const remove = row.createEl("button", { text: masterpieceFeatureText("settings.labels.delete") });
            remove.addEventListener("click", () => void deleteCategory(plugin, label).then(() => this.display()));
          });
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

let rendererInstalled = false;
function installRenderer(plugin: MasterpiecePlugin): void {
  if (rendererInstalled) return;
  rendererInstalled = true;
  const activeFilters = new WeakMap<HTMLElement, boolean>();
  const originalRender = AnimeListUI.renderLibrary.bind(AnimeListUI);
  AnimeListUI.renderLibrary = (container: HTMLElement, inputItems: MasterpieceItem[], adapters: any = {}) => {
    const active = activeFilters.get(container) === true;
    const items = active ? inputItems.filter((item) => item.favorite) : inputItems;
    originalRender(container, items, adapters);

    const statusBar = container.querySelector<HTMLElement>(".al-status-bar");
    if (statusBar) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `al-status-chip${active ? " is-active" : ""}`;
      button.textContent = specialLabelName(modeOf(plugin));
      button.addEventListener("click", () => {
        activeFilters.set(container, !active);
        AnimeListUI.renderLibrary(container, inputItems, adapters);
      });
      statusBar.appendChild(button);
    }

    const byTitle = new Map(items.map((item) => [item.title, item]));
    container.querySelectorAll<HTMLElement>(".al-card").forEach((card) => {
      const title = card.querySelector(".al-card-title")?.textContent ?? "";
      const item = byTitle.get(title);
      if (!item) return;
      const favoriteButton = card.querySelector<HTMLButtonElement>(".al-favorite-button");
      if (favoriteButton && modeOf(plugin) === "masterpiece") {
        favoriteButton.title = item.favorite
          ? masterpieceFeatureText("library.editMasterpiece")
          : masterpieceFeatureText("library.addMasterpiece");
        favoriteButton.setAttribute("aria-label", favoriteButton.title);
      }
      if (modeOf(plugin) !== "masterpiece" || !item.masterpieceLabels.length) return;
      let tags = card.querySelector<HTMLElement>(".al-tags");
      if (!tags) {
        tags = document.createElement("div");
        tags.className = "al-tags";
        card.querySelector(".al-progress")?.before(tags);
      }
      item.masterpieceLabels.forEach((label) => {
        const tag = document.createElement("span");
        tag.className = "al-tag al-masterpiece-tag";
        tag.textContent = label;
        tags?.appendChild(tag);
      });
    });
  };
}

function installPluginAdapters(plugin: MasterpiecePlugin): void {
  const originalCollect = plugin.collectMediaItems.bind(plugin);
  plugin.collectMediaItems = ((source?: string) => originalCollect(source).map((item: MasterpieceItem) => {
    const file = plugin.app.vault.getAbstractFileByPath(item.filePath);
    const frontmatter = file instanceof TFile
      ? plugin.app.metadataCache.getFileCache(file)?.frontmatter
      : undefined;
    return {
      ...item,
      masterpieceLabels: normalizeMasterpieceLabels(frontmatter?.masterpiece_labels),
    };
  })) as MasterpiecePlugin["collectMediaItems"];

  const originalFavorite = plugin.setFavorite.bind(plugin);
  plugin.setFavorite = async (path: string, next: boolean): Promise<void> => {
    const file = plugin.app.vault.getAbstractFileByPath(path);
    const frontmatter = file instanceof TFile
      ? plugin.app.metadataCache.getFileCache(file)?.frontmatter
      : undefined;
    const labels = normalizeMasterpieceLabels(frontmatter?.masterpiece_labels);
    if (modeOf(plugin) === "masterpiece") {
      new MasterpieceSelectionModal(plugin, path, labels).open();
      return;
    }
    if (next) {
      await originalFavorite(path, true);
      return;
    }
    const state = stateAfterFavoriteChange(labels, false);
    await writeMasterpieceState(plugin, path, state.favorite, state.masterpieceLabels);
  };
}

export async function installMasterpieceLabels(plugin: AnimeListPlugin): Promise<void> {
  const target = plugin as MasterpiecePlugin;
  const loaded = await target.loadData();
  const raw = typeof loaded === "object" && loaded !== null && !Array.isArray(loaded)
    ? loaded as Record<string, unknown>
    : {};
  target.settings.specialLabelMode = normalizeSpecialLabelMode(raw.specialLabelMode);
  installSettingsSection();
  installPluginAdapters(target);
  installRenderer(target);
}
