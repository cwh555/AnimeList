import { App, Notice, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type { SettingDefinition } from "obsidian";
import type { AnimeListSettings, StorageMode } from "./types";
import { uiText } from "./ui-text";

const DEFAULT_LIBRARY_FOLDER = "AnimeList";
const ADDITIONAL_FOLDER_EXAMPLE = "Media\nArchive/Anime";
const DEFAULT_COVER_FOLDER = "AnimeList/Covers";
const DEFAULT_TEMPLATE_FOLDER = "AnimeList/Templates";

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
    view: "grid",
    mediaType: "all",
    status: "all",
    genre: "all",
    query: "",
    sort: "updated_desc",
  },
};

interface SettingsPlugin {
  app: App;
  settings: AnimeListSettings;
  saveSettings(): Promise<void>;
  initializeLibrary(copyTemplates?: boolean): Promise<void>;
  openLibrary(): Promise<void>;
}

function normalizeFolder(value: string, fallback: string): string {
  return normalizePath(value.trim()).replace(/^\/+|\/+$/g, "") || fallback;
}

function parseAdditionalFolders(value: string): string[] {
  return [...new Set(value
    .split(/\r?\n/)
    .map((folder) => normalizePath(folder.trim()).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean))];
}

function additionalFolderText(folders: string[]): string {
  return folders.join("\n");
}

function storageSettings(plugin: SettingsPlugin): SettingDefinition[] {
  return [
    {
      name: uiText("settings.storageMode"),
      description: uiText("settings.storageModeDescription"),
      build(setting) {
        setting.addDropdown((dropdown) => dropdown
          .addOption("managed", uiText("settings.storageManaged"))
          .addOption("flat", uiText("settings.storageFlat"))
          .setValue(plugin.settings.storageMode)
          .onChange(async (value) => {
            plugin.settings.storageMode = value as StorageMode;
            await plugin.saveSettings();
          }));
      },
    },
    {
      name: uiText("settings.libraryRoot"),
      description: uiText("settings.libraryRootDescription"),
      build(setting) {
        setting.addText((text) => text
          .setPlaceholder(DEFAULT_LIBRARY_FOLDER)
          .setValue(plugin.settings.libraryRoot)
          .onChange(async (value) => {
            plugin.settings.libraryRoot = normalizeFolder(value, DEFAULT_LIBRARY_FOLDER);
            await plugin.saveSettings();
          }));
      },
    },
    {
      name: uiText("settings.flatMediaFolder"),
      description: uiText("settings.flatMediaFolderDescription"),
      build(setting) {
        setting.addText((text) => text
          .setPlaceholder(DEFAULT_LIBRARY_FOLDER)
          .setValue(plugin.settings.flatMediaFolder)
          .onChange(async (value) => {
            plugin.settings.flatMediaFolder = normalizeFolder(value, DEFAULT_LIBRARY_FOLDER);
            await plugin.saveSettings();
          }));
      },
    },
    {
      name: uiText("settings.additionalFolders"),
      description: uiText("settings.additionalFoldersDescription"),
      build(setting) {
        setting.addTextArea((text) => {
          text
            .setPlaceholder(ADDITIONAL_FOLDER_EXAMPLE)
            .setValue(additionalFolderText(plugin.settings.additionalScanFolders))
            .onChange(async (value) => {
              plugin.settings.additionalScanFolders = parseAdditionalFolders(value);
              await plugin.saveSettings();
            });
          text.inputEl.rows = 4;
        });
      },
    },
    {
      name: uiText("settings.coverFolder"),
      description: uiText("settings.coverFolderDescription"),
      build(setting) {
        setting.addText((text) => text
          .setPlaceholder(DEFAULT_COVER_FOLDER)
          .setValue(plugin.settings.coverFolder)
          .onChange(async (value) => {
            plugin.settings.coverFolder = normalizeFolder(value, DEFAULT_COVER_FOLDER);
            await plugin.saveSettings();
          }));
      },
    },
    {
      name: uiText("settings.templateFolder"),
      description: uiText("settings.templateFolderDescription"),
      build(setting) {
        setting.addText((text) => text
          .setPlaceholder(DEFAULT_TEMPLATE_FOLDER)
          .setValue(plugin.settings.templateFolder)
          .onChange(async (value) => {
            plugin.settings.templateFolder = normalizeFolder(value, DEFAULT_TEMPLATE_FOLDER);
            await plugin.saveSettings();
          }));
      },
    },
  ];
}

function providerSettings(plugin: SettingsPlugin): SettingDefinition[] {
  return [
    {
      name: "Bangumi",
      description: uiText("settings.providerBangumi"),
      build(setting) {
        setting.addToggle((toggle) => toggle
          .setValue(plugin.settings.providers.bangumi)
          .onChange(async (value) => {
            plugin.settings.providers.bangumi = value;
            await plugin.saveSettings();
          }));
      },
    },
    {
      name: "AniList",
      description: uiText("settings.providerAniList"),
      build(setting) {
        setting.addToggle((toggle) => toggle
          .setValue(plugin.settings.providers.anilist)
          .onChange(async (value) => {
            plugin.settings.providers.anilist = value;
            await plugin.saveSettings();
          }));
      },
    },
    {
      name: "Open Library",
      description: uiText("settings.providerOpenLibrary"),
      build(setting) {
        setting.addToggle((toggle) => toggle
          .setValue(plugin.settings.providers.openlibrary)
          .onChange(async (value) => {
            plugin.settings.providers.openlibrary = value;
            await plugin.saveSettings();
          }));
      },
    },
  ];
}

export class AnimeListSettingTab extends PluginSettingTab {
  private readonly plugin: SettingsPlugin;

  constructor(app: App, plugin: SettingsPlugin) {
    super(app, plugin as never);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: uiText("settings.title") });

    for (const definition of storageSettings(this.plugin)) {
      definition.build(new Setting(containerEl)
        .setName(definition.name)
        .setDesc(definition.description));
    }

    containerEl.createEl("h3", { text: uiText("settings.providers") });
    for (const definition of providerSettings(this.plugin)) {
      definition.build(new Setting(containerEl)
        .setName(definition.name)
        .setDesc(definition.description));
    }

    new Setting(containerEl)
      .setName(uiText("settings.initialize"))
      .setDesc(uiText("settings.initializeDescription"))
      .addButton((button) => button
        .setButtonText(uiText("settings.initializeButton"))
        .onClick(async () => {
          await this.plugin.initializeLibrary(true);
          new Notice(uiText("settings.initializeDone"));
        }));

    new Setting(containerEl)
      .setName(uiText("settings.openLibrary"))
      .setDesc(uiText("settings.openLibraryDescription"))
      .addButton((button) => button
        .setButtonText(uiText("settings.openLibraryButton"))
        .onClick(async () => this.plugin.openLibrary()));
  }
}
