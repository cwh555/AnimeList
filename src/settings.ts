import { App, Notice, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type { SettingDefinition } from "obsidian";
import { DEFAULT_SEARCH_LANGUAGES } from "./multilingual-search";
import { withActiveLocale } from "./i18n/catalog";
import { searchFeatureText } from "./search-feature-text";
import {
  MAX_TIMELINE_MAX_STACK_DEPTH,
  MIN_TIMELINE_MAX_STACK_DEPTH,
  normalizeTimelineMaxStackDepth,
} from "./timeline-scale";
import type {
  AnimeListSettings,
  LanguagePreference,
  SearchLanguage,
  SearchLanguageSettings,
  StorageMode,
} from "./types";
export { DEFAULT_SETTINGS } from "./settings-model";
import { uiText } from "./ui-text";

const DEFAULT_LIBRARY_FOLDER = "AnimeList";
const ADDITIONAL_FOLDER_EXAMPLE = "Media\nArchive/Anime";
const DEFAULT_COVER_FOLDER = "AnimeList/Covers";
const DEFAULT_TEMPLATE_FOLDER = "AnimeList/Templates";

export interface AnimeListSettingsHost {
  app: App;
  settings: AnimeListSettings;
  saveSettings(): Promise<void>;
  initializeLibrary(copyTemplates?: boolean): Promise<void>;
  refreshViews(): void;
  setInterfaceLanguage?(preference: LanguagePreference): Promise<void>;
  getFeatureSettingsSections?(): SettingsSection[];
}

export interface SettingsSection {
  heading?: string;
  description?: string;
  definitions: SettingDefinition[];
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

  getInterfaceLanguageDefinition(): SettingDefinition {
    return withActiveLocale("en", () => ({
      name: uiText("settings.language.name"),
      desc: uiText("settings.language.desc"),
      render: (setting) => this.renderInterfaceLanguage(setting),
    }));
  }

  getSettingDefinitions(): SettingDefinition[] {
    return withActiveLocale("en", () => [
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
        name: uiText("settings.timelineMaxStackDepth.name"),
        desc: uiText("settings.timelineMaxStackDepth.desc"),
        render: (setting) => this.renderTimelineMaxStackDepth(setting),
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
    ]);
  }

  getSearchLanguageDefinitions(): SettingDefinition[] {
    return withActiveLocale("en", () => [
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
    ]);
  }

  getSettingSections(): SettingsSection[] {
    return withActiveLocale("en", () => {
      const base = this.getSettingDefinitions();
      const sections: SettingsSection[] = [
        { definitions: [this.getInterfaceLanguageDefinition(), ...base.slice(0, 6)] },
        {
          heading: uiText("settings.timeline.heading"),
          description: uiText("settings.timeline.desc"),
          definitions: base.slice(6, 7),
        },
        {
          heading: searchFeatureText("settings.languages.heading"),
          definitions: this.getSearchLanguageDefinitions(),
        },
        {
          heading: uiText("settings.providers.heading"),
          definitions: base.slice(7, 10),
        },
        {
          heading: uiText("settings.setup.heading"),
          definitions: base.slice(10),
        },
      ];
      const featureSections = this.plugin.getFeatureSettingsSections?.() ?? [];
      sections.splice(1, 0, ...featureSections);
      return sections;
    });
  }

  display(): void {
    this.plugin.settings.timelineMaxStackDepth = normalizeTimelineMaxStackDepth(
      this.plugin.settings.timelineMaxStackDepth,
    );
    this.renderImperativeSettings();
  }

  private renderImperativeSettings(): void {
    withActiveLocale("en", () => {
      const { containerEl } = this;
      containerEl.empty();
      containerEl.createEl("p", {
        text: uiText("settings.intro"),
      });

      for (const section of this.getSettingSections()) {
        if (section.heading) {
          const heading = new Setting(containerEl).setName(section.heading).setHeading();
          if (section.description) heading.setDesc(section.description);
        }
        for (const definition of section.definitions) {
          if (definition.visible && !definition.visible()) continue;
          const setting = new Setting(containerEl).setName(definition.name);
          if (definition.desc) setting.setDesc(definition.desc);
          definition.render?.(setting);
        }
      }
    });
  }

  private refreshSettingsTab(): void {
    if (typeof this.update === "function") {
      this.update();
      return;
    }
    this.renderImperativeSettings();
  }

  private renderInterfaceLanguage(setting: Setting): void {
    setting.addDropdown((dropdown) => {
      dropdown
        .addOption("system", uiText("settings.language.system"))
        .addOption("zh-TW", uiText("settings.language.zhTW"))
        .addOption("en", uiText("settings.language.en"))
        .addOption("ja", uiText("settings.language.ja"))
        .addOption("ko", uiText("settings.language.ko"))
        .setValue(this.plugin.settings.interfaceLanguage)
        .onChange(async (value) => {
          const preference = value as LanguagePreference;
          if (this.plugin.setInterfaceLanguage) {
            await this.plugin.setInterfaceLanguage(preference);
          } else {
            this.plugin.settings.interfaceLanguage = preference;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          }
          this.refreshSettingsTab();
        });
    });
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
          this.plugin.settings.libraryRoot = normalizePath(value.trim())
            .replace(/^\/+|\/+$/g, "") || "AnimeList";
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
          this.plugin.settings.flatMediaFolder = normalizePath(value.trim())
            .replace(/^\/+|\/+$/g, "");
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
          this.plugin.settings.coverFolder = normalizePath(value.trim())
            .replace(/^\/+|\/+$/g, "") || "AnimeList/Covers";
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
          this.plugin.settings.templateFolder = normalizePath(value.trim())
            .replace(/^\/+|\/+$/g, "") || "AnimeList/Templates";
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

  private renderTimelineMaxStackDepth(setting: Setting): void {
    setting.addDropdown((dropdown) => {
      for (
        let depth = MIN_TIMELINE_MAX_STACK_DEPTH;
        depth <= MAX_TIMELINE_MAX_STACK_DEPTH;
        depth += 1
      ) {
        dropdown.addOption(String(depth), String(depth));
      }
      dropdown
        .setValue(String(normalizeTimelineMaxStackDepth(
          this.plugin.settings.timelineMaxStackDepth,
        )))
        .onChange(async (value) => {
          this.plugin.settings.timelineMaxStackDepth =
            normalizeTimelineMaxStackDepth(value);
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
