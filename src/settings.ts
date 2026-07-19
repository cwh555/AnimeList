import { App, Notice, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type { AnimeListSettings, StorageMode } from "./types";

export const DEFAULT_SETTINGS: AnimeListSettings = {
  storageMode: "managed",
  libraryRoot: "AnimeList",
  flatMediaFolder: "AnimeList",
  additionalScanFolders: [],
  coverFolder: "AnimeList/Covers",
  templateFolder: "AnimeList/Templates",
  providers: {
    bangumi: true,
    anilist: true,
    openlibrary: true,
  },
  uiState: {
    section: "library",
    type: "all",
    status: "all",
    genre: "all",
    sort: "completed-desc",
    view: "grid",
  },
};

export interface AnimeListSettingsHost {
  app: App;
  settings: AnimeListSettings;
  saveSettings(): Promise<void>;
  initializeLibrary(copyTemplates?: boolean): Promise<void>;
  refreshViews(): void;
}

function splitFolders(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((folder) => normalizePath(folder.trim()).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
}

export class AnimeListSettingTab extends PluginSettingTab {
  plugin: AnimeListSettingsHost;

  constructor(app: App, plugin: AnimeListSettingsHost) {
    super(app, plugin as never);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "AnimeList" });
    containerEl.createEl("p", {
      text: "AnimeList keeps media records in Markdown. These settings only control where notes, covers, and templates are stored and scanned.",
    });

    new Setting(containerEl)
      .setName("Storage layout")
      .setDesc("Managed mode creates Anime, Manga, and Novel subfolders. Flat mode writes every media note directly into one folder.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("managed", "Managed library")
          .addOption("flat", "Flat folder")
          .setValue(this.plugin.settings.storageMode)
          .onChange(async (value) => {
            this.plugin.settings.storageMode = value as StorageMode;
            await this.plugin.saveSettings();
            this.display();
            this.plugin.refreshViews();
          }),
      );

    if (this.plugin.settings.storageMode === "managed") {
      new Setting(containerEl)
        .setName("Library root")
        .setDesc("AnimeList creates Anime, Manga, Novel, Covers, and Templates below this folder. The default is AnimeList.")
        .addText((text) =>
          text
            .setPlaceholder("AnimeList")
            .setValue(this.plugin.settings.libraryRoot)
            .onChange(async (value) => {
              this.plugin.settings.libraryRoot = normalizePath(value.trim()).replace(/^\/+|\/+$/g, "") || "AnimeList";
              await this.plugin.saveSettings();
            }),
        );
    } else {
      new Setting(containerEl)
        .setName("Flat media folder")
        .setDesc("Media notes are created directly in this folder without Anime, Manga, or Novel subfolders. Leave blank to use the vault root.")
        .addText((text) =>
          text
            .setPlaceholder("Media")
            .setValue(this.plugin.settings.flatMediaFolder)
            .onChange(async (value) => {
              this.plugin.settings.flatMediaFolder = normalizePath(value.trim()).replace(/^\/+|\/+$/g, "");
              await this.plugin.saveSettings();
            }),
        );
    }

    new Setting(containerEl)
      .setName("Additional scan folders")
      .setDesc("Optional existing folders to read without moving files. Enter one vault-relative path per line or separate paths with commas.")
      .addTextArea((text) =>
        text
          .setPlaceholder("Media\nArchive/Anime")
          .setValue(this.plugin.settings.additionalScanFolders.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.additionalScanFolders = splitFolders(value);
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          }),
      );

    new Setting(containerEl)
      .setName("Cover folder")
      .setDesc("Downloaded cover images are stored below this folder, grouped by media type.")
      .addText((text) =>
        text
          .setPlaceholder("AnimeList/Covers")
          .setValue(this.plugin.settings.coverFolder)
          .onChange(async (value) => {
            this.plugin.settings.coverFolder = normalizePath(value.trim()).replace(/^\/+|\/+$/g, "") || "AnimeList/Covers";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Template folder")
      .setDesc("Custom templates are read from Anime, Manga, Novel, and Common subfolders below this location.")
      .addText((text) =>
        text
          .setPlaceholder("AnimeList/Templates")
          .setValue(this.plugin.settings.templateFolder)
          .onChange(async (value) => {
            this.plugin.settings.templateFolder = normalizePath(value.trim()).replace(/^\/+|\/+$/g, "") || "AnimeList/Templates";
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h3", { text: "Metadata providers" });
    const providerRows: Array<[keyof AnimeListSettings["providers"], string, string]> = [
      ["bangumi", "Bangumi", "Search anime, manga, and light novels. Useful for Chinese and Japanese titles."],
      ["anilist", "AniList", "Search anime, manga, and light novels with structured metadata."],
      ["openlibrary", "Open Library", "Search general novels and books."],
    ];
    providerRows.forEach(([key, name, description]) => {
      new Setting(containerEl)
        .setName(name)
        .setDesc(description)
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.providers[key]).onChange(async (value) => {
            this.plugin.settings.providers[key] = value;
            await this.plugin.saveSettings();
          }),
        );
    });

    containerEl.createEl("h3", { text: "Library setup" });
    new Setting(containerEl)
      .setName("Create configured folders")
      .setDesc("Creates missing note, cover, and template folders. Existing files are never moved or overwritten.")
      .addButton((button) =>
        button.setButtonText("Create folders").onClick(async () => {
          await this.plugin.initializeLibrary(false);
          new Notice("AnimeList folders are ready.");
        }),
      );

    new Setting(containerEl)
      .setName("Copy default templates")
      .setDesc("Writes the built-in Traditional Chinese templates into the configured template folder. Existing files are not overwritten.")
      .addButton((button) =>
        button.setButtonText("Copy templates").onClick(async () => {
          await this.plugin.initializeLibrary(true);
          new Notice("Default templates are ready.");
        }),
      );
  }
}
