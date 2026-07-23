import { App, Notice, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type { SettingDefinition } from "obsidian";
import "./search-enhancements";
import "./search-pagination";
import { DEFAULT_SEARCH_LANGUAGES } from "./multilingual-search";
import { searchFeatureText } from "./search-feature-text";
import type {
  AnimeListSettings,
  SearchLanguage,
  SearchLanguageSettings,
  StorageMode,
} from "./types";
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
  searchLanguages: { ...DEFAULT_SEARCH_LANGUAGES },
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
        name: uiText("settings.storageLayout.name"),
        desc: uiText("settings.storageLayout.desc"),
        render: (setting) => this.renderStorageLayout(setting),
      },
      {
        name: uiText("settings.libraryRoot.name"),
        desc: uiText("settings.libraryRoot.desc"),
        visible: () => this.plugin.settings.storageMode === "managed",
        render: (setting) => this.renderLibraryRoot(setting),
      },
      {
        name: uiText("settings.flatFolder.name"),
        desc: uiText("settings.flatFolder.desc"),
        visible: () => this.plugin.settings.storageMode === "flat",
        render: (setting) => this.renderFlatMediaFolder(setting),
      },
      {
        name: uiText("settings.additionalFolders.name"),
        desc: uiText("settings.additionalFolders.desc"),
        render: (setting) => this.renderAdditionalScanFolders(setting),
      },
      {
        name: uiText("settings.coverFolder.name"),
        desc: uiText("settings.coverFolder.desc"),
        render: (setting) => this.renderCoverFolder(setting),
      },
      {
        name: uiText("settings.templateFolder.name"),
        desc: uiText("settings.templateFolder.desc"),
        render: (setting) => this.renderTemplateFolder(setting),
      },
      {
        name: searchFeatureText("settings.languages.chinese.name"),
        desc: searchFeatureText("settings.languages.chinese.desc"),
        render: (setting) => this.renderSearchLanguage(setting, "chinese"),
      },
      {
        name: searchFeatureText("settings.languages.english.name"),
        desc: searchFeatureText("settings.languages.english.desc"),
        render: (setting) => this.renderSearchLanguage(setting, "english"),
      },
      {
        name: searchFeatureText("settings.languages.original.name"),
        desc: searchFeatureText("settings.languages.original.desc"),
        render: (setting) => this.renderSearchLanguage(setting, "original"),
      },
      {
        name: uiText("media.provider.bangumi"),
        desc: uiText("settings.provider.bangumi.desc"),
        render: (setting) => this.renderProvider(setting, "bangumi"),
      },
      {
        name: uiText("media.provider.anilist"),
        desc: uiText("settings.provider.anilist.desc"),
        render: (setting) => this.renderProvider(setting, "anilist"),
      },
      {
        name: uiText("media.provider.openlibrary"),
        desc: uiText("settings.provider.openlibrary.desc"),
        render: (setting) => this.renderProvider(setting, "openlibrary"),
      },
      {
        name: uiText("settings.createFolders.name"),
        desc: uiText("settings.createFolders.desc"),
        render: (setting) => this.renderCreateFolders(setting),
      },
      {
        name: uiText("settings.copyTemplates.name"),
        desc: uiText("settings.copyTemplates.desc"),
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
      text: uiText("settings.intro"),
    });

    const definitions = this.getSettingDefinitions();
    definitions.forEach((definition) => {
      if (definition.visible && !definition.visible()) return;
      if (definition.name === searchFeatureText("settings.languages.chinese.name")) {
        new Setting(containerEl).setName(searchFeatureText("settings.languages.heading")).setHeading();
      }
      if (definition.name === uiText("media.provider.bangumi")) {
        new Setting(containerEl).setName(uiText("settings.providers.heading")).setHeading();
      }
      if (definition.name === uiText("settings.createFolders.name")) {
        new Setting(containerEl).setName(uiText("settings.setup.heading")).setHeading();
      }
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
        .addOption("managed", uiText("settings.storageLayout.managed"))
        .addOption("flat", uiText("settings.storageLayout.flat"))
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

  private searchLanguages(): SearchLanguageSettings {
    if (!this.plugin.settings.searchLanguages) {
      this.plugin.settings.searchLanguages = { ...DEFAULT_SEARCH_LANGUAGES };
    }
    return this.plugin.settings.searchLanguages;
  }

  private renderSearchLanguage(setting: Setting, language: SearchLanguage): void {
    setting.addToggle((toggle) => {
      toggle.setValue(this.searchLanguages()[language]).onChange(async (value) => {
        this.searchLanguages()[language] = value;
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
      button.setButtonText(uiText("settings.createFolders.button")).onClick(async () => {
        await this.plugin.initializeLibrary(false);
        new Notice(uiText("settings.createFolders.notice"));
      });
    });
  }

  private renderCopyTemplates(setting: Setting): void {
    setting.addButton((button) => {
      button.setButtonText(uiText("settings.copyTemplates.button")).onClick(async () => {
        await this.plugin.initializeLibrary(true);
        new Notice(uiText("settings.copyTemplates.notice"));
      });
    });
  }
}
