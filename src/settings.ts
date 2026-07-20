import { App, Notice, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type { SettingDefinition } from "obsidian";
import type { AnimeListSettings, StorageMode } from "./types";

const SETTINGS_INTRO = "AnimeList keeps media records in Markdown. These settings only control where notes, covers, and templates are stored and scanned.";
const DEFAULT_LIBRARY_FOLDER = "AnimeList";
const ADDITIONAL_FOLDER_EXAMPLE = "Media\nArchive/Anime";
const DEFAULT_COVER_FOLDER = "AnimeList/Covers";
const DEFAULT_TEMPLATE_FOLDER = "AnimeList/Templates";
const FOLDERS_READY_NOTICE = "AnimeList folders are ready.";

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

  getSettingDefinitions(): SettingDefinition[] {
    const definitions: SettingDefinition[] = [
      {
        name: "Storage layout",
        desc: "Managed mode creates Anime, Manga, and Novel subfolders. Flat mode writes every media note directly into one folder.",
        render: (setting) => this.renderStorageLayout(setting),
      },
      {
        name: "Library root",
        desc: "AnimeList creates Anime, Manga, Novel, Covers, and Templates below this folder. The default is AnimeList.",
        visible: () => this.plugin.settings.storageMode === "managed",
        render: (setting) => this.renderLibraryRoot(setting),
      },
      {
        name: "Flat media folder",
        desc: "Media notes are created directly in this folder without Anime, Manga, or Novel subfolders. Leave blank to use the vault root.",
        visible: () => this.plugin.settings.storageMode === "flat",
        render: (setting) => this.renderFlatMediaFolder(setting),
      },
      {
        name: "Additional scan folders",
        desc: "Optional existing folders to read without moving files. Enter one vault-relative path per line or separate paths with commas.",
        render: (setting) => this.renderAdditionalScanFolders(setting),
      },
      {
        name: "Cover folder",
        desc: "Downloaded cover images are stored below this folder, grouped by media type.",
        render: (setting) => this.renderCoverFolder(setting),
      },
      {
        name: "Template folder",
        desc: "Custom templates are read from Anime, Manga, Novel, and Common subfolders below this location.",
        render: (setting) => this.renderTemplateFolder(setting),
      },
      {
        name: "Bangumi",
        desc: "Search anime, manga, and light novels. Useful for Chinese and Japanese titles.",
        render: (setting) => this.renderProvider(setting, "bangumi"),
      },
      {
        name: "AniList",
        desc: "Search anime, manga, and light novels with structured metadata.",
        render: (setting) => this.renderProvider(setting, "anilist"),
      },
      {
        name: "Open Library",
        desc: "Search general novels and books.",
        render: (setting) => this.renderProvider(setting, "openlibrary"),
      },
      {
        name: "Create configured folders",
        desc: "Creates missing note, cover, and template folders. Existing files are never moved or overwritten.",
        render: (setting) => this.renderCreateFolders(setting),
      },
      {
        name: "Copy default templates",
        desc: "Writes the built-in Traditional Chinese templates into the configured template folder. Existing files are not overwritten.",
        render: (setting) => this.renderCopyTemplates(setting),
      },
    ];
    return definitions;
  }

  display(): void {
    this.renderImperativeSettings();
  }

  private renderImperativeSettings(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      text: SETTINGS_INTRO,
    });

    const definitions = this.getSettingDefinitions();
    definitions.forEach((definition, index) => {
      if (definition.visible && !definition.visible()) return;
      if (index === 6) new Setting(containerEl).setName("Metadata providers").setHeading();
      if (index === 9) new Setting(containerEl).setName("Library setup").setHeading();
      const setting = new Setting(containerEl).setName(definition.name);
      if (definition.desc) setting.setDesc(definition.desc);
      definition.render?.(setting);
    });
  }

  private refreshSettingsTab(): void {
    if (typeof this.update === "function") {
      this.update();
      return;
    }
    this.renderImperativeSettings();
  }

  private renderStorageLayout(setting: Setting): void {
    setting.addDropdown((dropdown) => {
      dropdown
        .addOption("managed", "Managed library")
        .addOption("flat", "Flat folder")
        .setValue(this.plugin.settings.storageMode)
        .onChange(async (value) => {
          this.plugin.settings.storageMode = value as StorageMode;
          await this.plugin.saveSettings();
          this.refreshSettingsTab();
          this.plugin.refreshViews();
        });
    });
  }

  private renderLibraryRoot(setting: Setting): void {
    setting.addText((text) => {
      text
        .setPlaceholder(DEFAULT_LIBRARY_FOLDER)
        .setValue(this.plugin.settings.libraryRoot)
        .onChange(async (value) => {
          this.plugin.settings.libraryRoot = normalizePath(value.trim()).replace(/^\/+|\/+$/g, "") || "AnimeList";
          await this.plugin.saveSettings();
        });
    });
  }

  private renderFlatMediaFolder(setting: Setting): void {
    setting.addText((text) => {
      text
        .setPlaceholder("Media")
        .setValue(this.plugin.settings.flatMediaFolder)
        .onChange(async (value) => {
          this.plugin.settings.flatMediaFolder = normalizePath(value.trim()).replace(/^\/+|\/+$/g, "");
          await this.plugin.saveSettings();
        });
    });
  }

  private renderAdditionalScanFolders(setting: Setting): void {
    setting.addTextArea((text) => {
      text
        .setPlaceholder(ADDITIONAL_FOLDER_EXAMPLE)
        .setValue(this.plugin.settings.additionalScanFolders.join("\n"))
        .onChange(async (value) => {
          this.plugin.settings.additionalScanFolders = splitFolders(value);
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        });
    });
  }

  private renderCoverFolder(setting: Setting): void {
    setting.addText((text) => {
      text
        .setPlaceholder(DEFAULT_COVER_FOLDER)
        .setValue(this.plugin.settings.coverFolder)
        .onChange(async (value) => {
          this.plugin.settings.coverFolder = normalizePath(value.trim()).replace(/^\/+|\/+$/g, "") || "AnimeList/Covers";
          await this.plugin.saveSettings();
        });
    });
  }

  private renderTemplateFolder(setting: Setting): void {
    setting.addText((text) => {
      text
        .setPlaceholder(DEFAULT_TEMPLATE_FOLDER)
        .setValue(this.plugin.settings.templateFolder)
        .onChange(async (value) => {
          this.plugin.settings.templateFolder = normalizePath(value.trim()).replace(/^\/+|\/+$/g, "") || "AnimeList/Templates";
          await this.plugin.saveSettings();
        });
    });
  }

  private renderProvider(setting: Setting, key: keyof AnimeListSettings["providers"]): void {
    setting.addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.providers[key]).onChange(async (value) => {
        this.plugin.settings.providers[key] = value;
        await this.plugin.saveSettings();
      });
    });
  }

  private renderCreateFolders(setting: Setting): void {
    setting.addButton((button) => {
      button.setButtonText("Create folders").onClick(async () => {
        await this.plugin.initializeLibrary(false);
        new Notice(FOLDERS_READY_NOTICE);
      });
    });
  }

  private renderCopyTemplates(setting: Setting): void {
    setting.addButton((button) => {
      button.setButtonText("Copy templates").onClick(async () => {
        await this.plugin.initializeLibrary(true);
        new Notice("Default templates are ready.");
      });
    });
  }
}
