import { App, Notice, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type { SettingDefinition } from "obsidian";
import { installReliableLibraryNavigation } from "./library-navigation";
import "./search-pagination";
import "./search-enhancements";
import {
  DEFAULT_SEARCH_LANGUAGES,
  normalizeSearchLanguageSettings,
} from "./multilingual-search";
import { searchFeatureText } from "./search-feature-text";
import {
  DEFAULT_TIMELINE_MAX_STACK_DEPTH,
  MAX_TIMELINE_MAX_STACK_DEPTH,
  MIN_TIMELINE_MAX_STACK_DEPTH,
  normalizeTimelineMaxStackDepth,
} from "./timeline-scale";
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
  timelineMaxStackDepth: DEFAULT_TIMELINE_MAX_STACK_DEPTH,
  googleBooksApiKey: "",
  providers: {
    bangumi: true,
    anilist: true,
    openlibrary: true,
  },
  searchLanguages: { ...DEFAULT_SEARCH_LANGUAGES },
  migrations: {
    mediaStatus: 0,
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
  loadData(): Promise<unknown>;
  saveSettings(): Promise<void>;
  initializeLibrary(copyTemplates?: boolean): Promise<void>;
  refreshViews(): void;
}

export interface SettingsSection {
  heading?: string;
  description?: string;
  definitions: SettingDefinition[];
}

export type SettingsSectionExtension = (
  tab: AnimeListSettingTab,
) => SettingsSection | SettingsSection[];

const SETTINGS_SECTION_EXTENSIONS = new Map<string, SettingsSectionExtension>();

export function registerSettingsSectionExtension(
  id: string,
  extension: SettingsSectionExtension,
): void {
  SETTINGS_SECTION_EXTENSIONS.set(id, extension);
}

function splitFolders(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((folder) => normalizePath(folder.trim()).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
}

function rawSearchLanguages(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>).searchLanguages;
}

export class AnimeListSettingTab extends PluginSettingTab {
  plugin: AnimeListSettingsHost;
  private searchLanguagesHydrated = false;
  private searchLanguagesHydration: Promise<void> | null = null;

  constructor(app: App, plugin: AnimeListSettingsHost) {
    super(app, plugin as never);
    this.plugin = plugin;
    installReliableLibraryNavigation(plugin);
  }

  getSettingDefinitions(): SettingDefinition[] {
    return [
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
    ];
  }

  getSearchLanguageDefinitions(): SettingDefinition[] {
    return [
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
    ];
  }

  getSettingSections(): SettingsSection[] {
    const base = this.getSettingDefinitions();
    const sections: SettingsSection[] = [
      { definitions: base.slice(0, 6) },
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
    const extensions = [...SETTINGS_SECTION_EXTENSIONS.values()]
      .flatMap((extension) => extension(this));
    sections.splice(1, 0, ...extensions);
    return sections;
  }

  display(): void {
    this.plugin.settings.timelineMaxStackDepth = normalizeTimelineMaxStackDepth(
      this.plugin.settings.timelineMaxStackDepth,
    );
    this.renderImperativeSettings();
    void this.hydrateSearchLanguages();
  }

  private async hydrateSearchLanguages(): Promise<void> {
    if (this.searchLanguagesHydrated) return;
    if (this.searchLanguagesHydration === null) {
      this.searchLanguagesHydration = (async () => {
        const loaded = await this.plugin.loadData();
        this.plugin.settings.searchLanguages = normalizeSearchLanguageSettings(rawSearchLanguages(loaded));
        this.searchLanguagesHydrated = true;
        this.renderImperativeSettings();
      })().catch((error) => {
        console.warn("AnimeList could not restore search language settings", error);
        this.searchLanguagesHydrated = true;
      }).finally(() => {
        this.searchLanguagesHydration = null;
      });
    }
    await this.searchLanguagesHydration;
  }

  private renderImperativeSettings(): void {
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
