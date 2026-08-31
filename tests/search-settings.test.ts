import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App } from "obsidian";
import type { SettingDefinitionItem, SettingDefinitionPage } from "obsidian";
import { AnimeListSettingTab, DEFAULT_SETTINGS } from "../src/ui/settings";
import {
  SETTINGS_PAGES,
  getSettingsPageDefinition,
  settingsPageForKey,
} from "../src/app/settings-layout";
import { registerLocaleMessages, resetLocaleForTests, setActiveLocale } from "../src/i18n/catalog";
import { EN_CORE_MESSAGES } from "../src/i18n/locales/en/core";
import { EN_SEARCH_MESSAGES } from "../src/i18n/locales/en/search";
import { JA_CORE_MESSAGES } from "../src/i18n/locales/ja/core";
import { JA_SEARCH_MESSAGES } from "../src/i18n/locales/ja/search";


function searchableSettingNames(items: readonly SettingDefinitionItem[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    if ("type" in item) {
      if (item.type === "page") {
        names.push(...searchableSettingNames(item.items ?? []));
        continue;
      }
      if (item.type === "group" || item.type === "list") {
        names.push(...searchableSettingNames(item.items ?? []));
        continue;
      }
    }
    if (item.searchable !== false) names.push(item.name);
  }
  return names;
}

function createHost() {
  return {
    app: new App(),
    settings: structuredClone(DEFAULT_SETTINGS),
    async loadData(): Promise<unknown> { return {}; },
    async saveSettings(): Promise<void> {},
    async initializeLibrary(): Promise<void> {},
    async cleanupGarbageFiles() { return { removedManagedFiles: 0, removedJournalFiles: 0, removedCacheFiles: 0 }; },
    refreshViews(): void {},
  };
}

describe("search language settings", () => {
  it("groups all language toggles in one English section", () => {
    const tab = new AnimeListSettingTab(new App(), createHost());
    const sections = tab.getSettingSections();
    const languageSection = sections.find((section) => section.heading === "Search languages");

    assert.ok(languageSection);
    assert.equal(languageSection.page, "search-metadata");
    assert.deepEqual(
      languageSection.definitions.map((definition) => definition.name),
      ["Chinese titles", "English titles", "Original-language titles"],
    );
    assert.equal(
      languageSection.definitions.every((definition) => (
        typeof definition.desc === "string" && !/[\u3400-\u9fff]/u.test(definition.desc)
      )),
      true,
    );
  });

  it("keeps the whole settings model in English regardless of interface language", () => {
    registerLocaleMessages("core", "en", EN_CORE_MESSAGES);
    registerLocaleMessages("search", "en", EN_SEARCH_MESSAGES);
    registerLocaleMessages("core", "ja", JA_CORE_MESSAGES);
    registerLocaleMessages("search", "ja", JA_SEARCH_MESSAGES);
    setActiveLocale("ja");
    try {
      const host = createHost();
      Object.assign(host, {
        getFeatureSettingsSections: () => [{
          heading: "Feature settings",
          description: "English feature description",
          definitions: [{ name: "Feature option", desc: "English option description" }],
        }],
      });
      const tab = new AnimeListSettingTab(new App(), host);
      const sections = tab.getSettingSections();
      assert.equal(tab.getInterfaceLanguageDefinition().name, "Display language");
      assert.equal(tab.getInterfaceLanguageDefinition().desc,
        "Choose the language used by AnimeList views, dialogs, and notices. The Settings page stays in English.");
      assert.equal(sections.some((section) => section.heading === "検索言語"), false);
      assert.ok(sections.some((section) => section.heading === "Search languages"));
      assert.ok(sections.some((section) => section.heading === "Metadata providers"));
      assert.equal(
        sections.flatMap((section) => [section.heading, section.description, ...section.definitions.flatMap((definition) => [definition.name, definition.desc])])
          .filter((value): value is string => typeof value === "string")
          .some((value) => /[ぁ-んァ-ヶ가-힣]/u.test(value)),
        false,
      );
      assert.deepEqual(
        tab.getSettingsPageSections("features").map((section) => section.heading),
        ["Feature settings"],
      );
    } finally {
      resetLocaleForTests();
    }
  });

  it("exposes the complete settings model through Obsidian 1.13 declarative pages", () => {
    const host = createHost();
    Object.assign(host, {
      getFeatureSettingsSections: () => [{
        page: "features" as const,
        heading: "Feature settings",
        definitions: [{ name: "Feature option", desc: "Feature option description" }],
      }],
    });
    const tab = new AnimeListSettingTab(new App(), host);
    const definitions = tab.getSettingDefinitions();
    const pages = definitions as SettingDefinitionPage[];

    assert.deepEqual(pages.map((page) => page.type), ["page", "page", "page", "page", "page"]);
    assert.deepEqual(pages.map((page) => page.name), SETTINGS_PAGES.map((page) => page.label));
    assert.deepEqual(pages.map((page) => page.desc), SETTINGS_PAGES.map((page) => page.description));

    const searchableNames = searchableSettingNames(definitions);
    assert.ok(searchableNames.includes("Display language"));
    assert.ok(searchableNames.includes("Storage layout"));
    assert.ok(searchableNames.includes("Chinese titles"));
    assert.ok(searchableNames.includes("AniList"));
    assert.ok(searchableNames.includes("Feature option"));

    const expectedDefinitionCount = tab.getSettingSections()
      .reduce((count, section) => count + section.definitions.length, 0);
    assert.equal(searchableNames.length, expectedDefinitionCount);
  });

  it("organizes core settings into five top-level pages with titled sections", () => {
    const tab = new AnimeListSettingTab(new App(), createHost());

    assert.deepEqual(SETTINGS_PAGES.map((page) => page.label), [
      "General",
      "Search & metadata",
      "Features",
      "Maintenance",
      "Updates & cleanup",
    ]);
    assert.deepEqual(SETTINGS_PAGES.map((page) => page.description), [
      "Core settings for the interface, library storage, file locations, and timeline behavior.",
      "Settings for title search languages and the metadata providers used to enrich your library.",
      "Settings for optional AnimeList features and their feature-specific behavior.",
      "Library setup and maintenance actions for folders, templates, and routine upkeep.",
      "Tools for update-related migrations and cleaning up legacy or obsolete AnimeList data.",
    ]);
    assert.equal(
      getSettingsPageDefinition("features").description,
      "Settings for optional AnimeList features and their feature-specific behavior.",
    );
    assert.deepEqual(tab.getSettingsPageSections("general").map((section) => section.heading), [
      "Interface",
      "Library & storage",
      "File locations",
      "Timeline",
    ]);
    assert.deepEqual(tab.getSettingsPageSections("search-metadata").map((section) => section.heading), [
      "Search languages",
      "Metadata providers",
    ]);
    assert.deepEqual(tab.getSettingsPageSections("updates-cleanup").map((section) => section.heading), []);
    assert.deepEqual(tab.getSettingsPageSections("maintenance").map((section) => section.heading), [
      "Library setup",
      "Storage cleanup",
    ]);
  });

  it("supports standard keyboard navigation across the top-level pages", () => {
    assert.equal(settingsPageForKey("general", "ArrowRight"), "search-metadata");
    assert.equal(settingsPageForKey("general", "ArrowLeft"), "updates-cleanup");
    assert.equal(settingsPageForKey("features", "Home"), "general");
    assert.equal(settingsPageForKey("features", "End"), "updates-cleanup");
    assert.equal(settingsPageForKey("features", "Enter"), null);
  });
  it("runs the garbage-file cleanup action from Maintenance", async () => {
    let cleanupCalls = 0;
    const host = createHost();
    host.cleanupGarbageFiles = async () => {
      cleanupCalls += 1;
      return { removedManagedFiles: 2, removedJournalFiles: 1, removedCacheFiles: 3 };
    };
    const tab = new AnimeListSettingTab(new App(), host);
    const section = tab.getSettingsPageSections("maintenance").find((value) => value.heading === "Storage cleanup");
    const definition = section?.definitions.find((value) => value.name === "Garbage files");
    assert.ok(definition?.render);

    let label = "";
    let click: (() => Promise<void>) | null = null;
    const buttonEl = { disabled: false };
    const setting = {
      addButton(callback: (button: {
        buttonEl: { disabled: boolean };
        setButtonText(value: string): unknown;
        onClick(handler: () => Promise<void>): unknown;
      }) => void) {
        const button = {
          buttonEl,
          setButtonText(value: string) { label = value; return this; },
          onClick(handler: () => Promise<void>) { click = handler; return this; },
        };
        callback(button);
        return this;
      },
    };
    definition.render(setting as never);
    assert.equal(label, "Clean garbage files");
    assert.ok(click);
    await click();
    assert.equal(cleanupCalls, 1);
    assert.equal(buttonEl.disabled, false);
  });

});
