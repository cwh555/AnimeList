import { App, Notice, PluginSettingTab, Setting, normalizePath, requireApiVersion } from "obsidian";
import type { SettingDefinition, SettingDefinitionItem } from "obsidian";
import { DEFAULT_SEARCH_LANGUAGES } from "../app/search/multilingual-search";
import { withActiveLocale } from "../i18n/catalog";
import { searchFeatureText } from "../features/search/text";
import {
  SETTINGS_PAGES,
  getSettingsPageDefinition,
  normalizeSettingsPage,
  settingsPageForKey,
  type SettingsPageId,
} from "../app/settings-layout";
import {
  MAX_TIMELINE_MAX_STACK_DEPTH,
  MIN_TIMELINE_MAX_STACK_DEPTH,
  normalizeTimelineMaxStackDepth,
} from "../domain/timeline/scale";
import type {
  AnimeListSettings,
  LanguagePreference,
  SearchLanguage,
  SearchLanguageSettings,
  StorageMode,
} from "../types";
export { DEFAULT_SETTINGS } from "../app/settings-model";
import { uiText } from "../ui-text";
import { buildDeclarativeSettingsPage } from "./settings-declarative";

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
  page?: SettingsPageId;
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

// Obsidian 1.13+ renders/searches the declarative tree; older versions still call display().
// Both paths are generated from getSettingSections() so settings behavior cannot drift.
export class AnimeListSettingTab extends PluginSettingTab {
  plugin: AnimeListSettingsHost;
  private activePage: SettingsPageId = "general";

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

  private getCoreSettingDefinitions(): SettingDefinition[] {
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
      const base = this.getCoreSettingDefinitions();
      const sections: SettingsSection[] = [
        {
          page: "general",
          definitions: [this.getInterfaceLanguageDefinition(), ...base.slice(0, 6)],
        },
        {
          page: "general",
          heading: uiText("settings.timeline.heading"),
          description: uiText("settings.timeline.desc"),
          definitions: base.slice(6, 7),
        },
        {
          page: "search-metadata",
          heading: searchFeatureText("settings.languages.heading"),
          definitions: this.getSearchLanguageDefinitions(),
        },
        {
          page: "search-metadata",
          heading: uiText("settings.providers.heading"),
          definitions: base.slice(7, 10),
        },
        {
          page: "maintenance",
          heading: uiText("settings.setup.heading"),
          definitions: base.slice(10),
        },
      ];
      const featureSections = (this.plugin.getFeatureSettingsSections?.() ?? []).map((section) => ({
        ...section,
        page: section.page ?? "features" as const,
      }));
      sections.splice(1, 0, ...featureSections);
      return sections;
    });
  }

  private pageSectionsFrom(
    allSections: readonly SettingsSection[],
    page: SettingsPageId,
  ): SettingsSection[] {
    const sections = allSections.filter((section) => section.page === page);
    if (page !== "general") return sections;
    const core = sections.find((section) => !section.heading);
    if (!core) return sections;
    return [
      { page: "general", heading: "Interface", definitions: core.definitions.slice(0, 1) },
      { page: "general", heading: "Library & storage", definitions: core.definitions.slice(1, 5) },
      { page: "general", heading: "File locations", definitions: core.definitions.slice(5) },
      ...sections.filter((section) => section !== core),
    ];
  }

  getSettingsPageSections(page: SettingsPageId): SettingsSection[] {
    return this.pageSectionsFrom(this.getSettingSections(), page);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return withActiveLocale("en", () => {
      const allSections = this.getSettingSections();
      return SETTINGS_PAGES.map((page) => buildDeclarativeSettingsPage(
        page,
        this.pageSectionsFrom(allSections, page.id),
      ));
    });
  }

  display(): void {
    this.plugin.settings.timelineMaxStackDepth = normalizeTimelineMaxStackDepth(
      this.plugin.settings.timelineMaxStackDepth,
    );
    this.renderImperativeSettings();
  }

  private renderPageTabs(containerEl: HTMLElement): void {
    const tabList = containerEl.createDiv({ cls: "animelist-settings-tabs" });
    tabList.setAttribute("role", "tablist");
    tabList.setAttribute("aria-label", "Settings pages");

    for (const page of SETTINGS_PAGES) {
      const active = page.id === this.activePage;
      const button = tabList.createEl("button", {
        cls: "animelist-settings-tab",
        text: page.label,
      });
      button.type = "button";
      button.id = `animelist-settings-tab-${page.id}`;
      button.dataset.settingsPage = page.id;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(active));
      button.setAttribute("aria-controls", `animelist-settings-panel-${page.id}`);
      button.tabIndex = active ? 0 : -1;
      button.classList.toggle("is-active", active);
      button.addEventListener("click", () => {
        if (page.id !== this.activePage) this.openSettingsPage(page.id);
      });
      button.addEventListener("keydown", (event) => {
        const next = settingsPageForKey(page.id, event.key);
        if (!next) return;
        event.preventDefault();
        this.openSettingsPage(next, true);
      });
      tabList.append(" ");
    }
  }

  private openSettingsPage(page: SettingsPageId, focusTab = false): void {
    this.activePage = normalizeSettingsPage(page);
    this.renderImperativeSettings();
    if (!focusTab) return;
    this.containerEl
      .querySelector<HTMLButtonElement>(`button[data-settings-page="${this.activePage}"]`)
      ?.focus();
  }

  private renderImperativeSettings(): void {
    withActiveLocale("en", () => {
      const { containerEl } = this;
      containerEl.empty();
      this.activePage = normalizeSettingsPage(this.activePage);
      this.renderPageTabs(containerEl);

      const panel = containerEl.createDiv({ cls: "animelist-settings-page" });
      panel.id = `animelist-settings-panel-${this.activePage}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", `animelist-settings-tab-${this.activePage}`);
      panel.createEl("p", {
        cls: "animelist-settings-intro",
        text: getSettingsPageDefinition(this.activePage).description,
      });

      for (const section of this.getSettingsPageSections(this.activePage)) {
        const sectionEl = panel.createEl("section", { cls: "animelist-settings-section" });
        if (section.heading) {
          const headerEl = sectionEl.createDiv({ cls: "animelist-settings-section-header" });
          const heading = new Setting(headerEl).setName(section.heading).setHeading();
          if (section.description) heading.setDesc(section.description);
        }

        const bodyEl = sectionEl.createDiv({ cls: "animelist-settings-section-body" });
        let renderedDefinitions = 0;
        for (const definition of section.definitions) {
          if (definition.visible === false
            || (typeof definition.visible === "function" && !definition.visible())) continue;
          const setting = new Setting(bodyEl).setName(definition.name);
          if (definition.desc) setting.setDesc(definition.desc);
          definition.render?.(setting);
          renderedDefinitions += 1;
        }
        if (renderedDefinitions === 0) sectionEl.remove();
      }
    });
  }

  private refreshSettingsTab(): void {
    if (requireApiVersion("1.13.0")) {
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
