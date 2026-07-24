// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Runtime adapter around the legacy renderer. Domain behavior remains typed and tested in masterpiece-labels.ts. */
import { Modal, Notice, Setting, TFile } from "obsidian";
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
import { masterpieceFeatureText, specialLabelName } from "./masterpiece-feature-text";

const installedRenderers = new WeakSet();

function modeOf(plugin) {
  return normalizeSpecialLabelMode(plugin.settings.specialLabelMode);
}

function cleanLabel(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

async function writeState(plugin, path, favorite, labels) {
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

function categoryNames(plugin) {
  return collectMasterpieceLabels(plugin.collectMediaItems());
}

class MasterpieceSelectionModal extends Modal {
  constructor(plugin, path, labels) {
    super(plugin.app);
    this.plugin = plugin;
    this.path = path;
    this.selected = new Set(labelsForMasterpieceEnable(labels));
  }

  onOpen() {
    this.modalEl.addClass("animelist-modal");
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: masterpieceFeatureText("modal.title") });
    this.contentEl.createEl("p", { text: masterpieceFeatureText("modal.description") });
    const form = this.contentEl.createDiv({ cls: "al-media-form" });
    const labels = [...new Set([...categoryNames(this.plugin), ...this.selected])]
      .sort((left, right) => left.localeCompare(right, "en"));
    labels.forEach((label) => {
      const row = form.createEl("label", { cls: "al-form-checkbox" });
      const checkbox = row.createEl("input");
      checkbox.type = "checkbox";
      checkbox.checked = this.selected.has(label);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selected.add(label);
        else this.selected.delete(label);
      });
      row.append(` ${label}`);
    });

    let newLabel = "";
    new Setting(this.contentEl)
      .setName(masterpieceFeatureText("modal.newLabel"))
      .addText((text) => text
        .setPlaceholder(masterpieceFeatureText("modal.newLabelPlaceholder"))
        .onChange((value) => { newLabel = cleanLabel(value); }));

    const actions = this.contentEl.createDiv({ cls: "al-modal-actions" });
    const remove = actions.createEl("button", {
      cls: "al-delete-button",
      text: masterpieceFeatureText("modal.remove"),
    });
    remove.addEventListener("click", () => void writeState(this.plugin, this.path, false, [])
      .then(() => { new Notice(masterpieceFeatureText("notice.removed")); this.close(); }));
    const save = actions.createEl("button", {
      cls: "mod-cta",
      text: masterpieceFeatureText("modal.save"),
    });
    save.addEventListener("click", () => {
      if (newLabel) this.selected.add(newLabel);
      const state = stateAfterMasterpieceSelection([...this.selected]);
      void writeState(this.plugin, this.path, state.favorite, state.masterpieceLabels)
        .then(() => { new Notice(masterpieceFeatureText("notice.saved")); this.close(); });
    });
  }
}

async function renameCategory(plugin, previous, replacement) {
  const next = cleanLabel(replacement);
  if (!next) return;
  for (const file of getScopedMarkdownFiles(plugin.app, plugin.getScanFolders())) {
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    const labels = normalizeMasterpieceLabels(frontmatter?.masterpiece_labels);
    const renamed = renameMasterpieceLabel(labels, previous, next);
    if (renamed.join("\n") === labels.join("\n")) continue;
    await plugin.app.fileManager.processFrontMatter(file, (fm) => { fm.masterpiece_labels = renamed; });
  }
  plugin.refreshViews();
  new Notice(masterpieceFeatureText("notice.renamed"));
}

async function deleteCategory(plugin, target) {
  for (const file of getScopedMarkdownFiles(plugin.app, plugin.getScanFolders())) {
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    const labels = normalizeMasterpieceLabels(frontmatter?.masterpiece_labels);
    const remaining = deleteMasterpieceLabel(labels, target);
    if (remaining.length === labels.length) continue;
    await plugin.app.fileManager.processFrontMatter(file, (fm) => {
      if (remaining.length) fm.masterpiece_labels = remaining;
      else delete fm.masterpiece_labels;
      fm.favorite = remaining.length > 0;
    });
  }
  plugin.refreshViews();
  new Notice(masterpieceFeatureText("notice.deleted"));
}

function installSettings() {
  const prototype = AnimeListSettingTab.prototype;
  if (prototype.__masterpieceInstalled) return;
  prototype.__masterpieceInstalled = true;
  const original = prototype.getSettingSections;
  prototype.getSettingSections = function () {
    const sections = original.call(this);
    const plugin = this.plugin;
    const definitions = [{
      name: masterpieceFeatureText("settings.mode.name"),
      desc: masterpieceFeatureText("settings.mode.desc"),
      render: (setting) => setting.addDropdown((dropdown) => dropdown
        .addOption("favorite", masterpieceFeatureText("settings.mode.favorite"))
        .addOption("masterpiece", masterpieceFeatureText("settings.mode.masterpiece"))
        .setValue(modeOf(plugin))
        .onChange(async (value) => {
          plugin.settings.specialLabelMode = normalizeSpecialLabelMode(value);
          await plugin.saveSettings();
          plugin.refreshViews();
          this.display();
        })),
    }];
    if (modeOf(plugin) === "masterpiece") {
      definitions.push({
        name: masterpieceFeatureText("settings.labels.name"),
        desc: masterpieceFeatureText("settings.labels.desc"),
        render: (setting) => {
          const labels = categoryNames(plugin);
          if (!labels.length) {
            setting.controlEl.createSpan({ text: masterpieceFeatureText("settings.labels.empty") });
            return;
          }
          const root = setting.controlEl.createDiv();
          labels.forEach((label) => {
            const row = root.createDiv({ cls: "al-masterpiece-setting-row" });
            const input = row.createEl("input");
            input.type = "text";
            input.value = label;
            const rename = row.createEl("button", { text: masterpieceFeatureText("settings.labels.rename") });
            rename.addEventListener("click", () => void renameCategory(plugin, label, input.value).then(() => this.display()));
            const remove = row.createEl("button", { text: masterpieceFeatureText("settings.labels.delete") });
            remove.addEventListener("click", () => void deleteCategory(plugin, label).then(() => this.display()));
          });
        },
      });
    }
    sections.splice(1, 0, { heading: masterpieceFeatureText("settings.heading"), definitions });
    return sections;
  };
}

function installPluginAdapters(plugin) {
  const originalCollect = plugin.collectMediaItems.bind(plugin);
  plugin.collectMediaItems = (source) => originalCollect(source).map((item) => {
    const file = plugin.app.vault.getAbstractFileByPath(item.filePath);
    const frontmatter = file instanceof TFile
      ? plugin.app.metadataCache.getFileCache(file)?.frontmatter
      : undefined;
    return { ...item, masterpieceLabels: normalizeMasterpieceLabels(frontmatter?.masterpiece_labels) };
  });

  const originalFavorite = plugin.setFavorite.bind(plugin);
  plugin.setFavorite = async (path, next) => {
    const file = plugin.app.vault.getAbstractFileByPath(path);
    const frontmatter = file instanceof TFile
      ? plugin.app.metadataCache.getFileCache(file)?.frontmatter
      : undefined;
    const labels = normalizeMasterpieceLabels(frontmatter?.masterpiece_labels);
    if (modeOf(plugin) === "masterpiece") {
      new MasterpieceSelectionModal(plugin, path, labels).open();
      return;
    }
    if (next) return originalFavorite(path, true);
    const state = stateAfterFavoriteChange(labels, false);
    await writeState(plugin, path, state.favorite, state.masterpieceLabels);
  };
}

function installRenderer(plugin) {
  if (installedRenderers.has(AnimeListUI)) return;
  installedRenderers.add(AnimeListUI);
  const activeFilters = new WeakMap();
  const original = AnimeListUI.renderLibrary.bind(AnimeListUI);
  AnimeListUI.renderLibrary = (container, inputItems, adapters = {}) => {
    const active = activeFilters.get(container) === true;
    const items = active ? inputItems.filter((item) => item.favorite) : inputItems;
    original(container, items, adapters);
    const statusBar = container.querySelector(".al-status-bar");
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
    container.querySelectorAll(".al-card").forEach((card) => {
      const item = byTitle.get(card.querySelector(".al-card-title")?.textContent || "");
      if (!item) return;
      const favorite = card.querySelector(".al-favorite-button");
      if (favorite && modeOf(plugin) === "masterpiece") {
        favorite.title = item.favorite
          ? masterpieceFeatureText("library.editMasterpiece")
          : masterpieceFeatureText("library.addMasterpiece");
        favorite.setAttribute("aria-label", favorite.title);
      }
      if (modeOf(plugin) !== "masterpiece" || !item.masterpieceLabels?.length) return;
      let tags = card.querySelector(".al-tags");
      if (!tags) {
        tags = document.createElement("div");
        tags.className = "al-tags";
        card.querySelector(".al-progress")?.before(tags);
      }
      item.masterpieceLabels.forEach((label) => {
        const tag = document.createElement("span");
        tag.className = "al-tag al-masterpiece-tag";
        tag.textContent = label;
        tags.appendChild(tag);
      });
    });
  };
}

export async function installMasterpieceLabels(plugin) {
  const loaded = await plugin.loadData();
  plugin.settings.specialLabelMode = normalizeSpecialLabelMode(loaded?.specialLabelMode);
  installSettings();
  installPluginAdapters(plugin);
  installRenderer(plugin);
}
