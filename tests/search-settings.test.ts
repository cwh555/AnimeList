import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App } from "obsidian";
import { AnimeListSettingTab, DEFAULT_SETTINGS } from "../src/settings";
import { SETTINGS_PAGES, settingsPageForKey } from "../src/settings-layout";
import { registerLocaleMessages, resetLocaleForTests, setActiveLocale } from "../src/i18n/catalog";
import { EN_CORE_MESSAGES } from "../src/i18n/locales/en/core";
import { EN_SEARCH_MESSAGES } from "../src/i18n/locales/en/search";
import { JA_CORE_MESSAGES } from "../src/i18n/locales/ja/core";
import { JA_SEARCH_MESSAGES } from "../src/i18n/locales/ja/search";

function createHost() {
  return {
    app: new App(),
    settings: structuredClone(DEFAULT_SETTINGS),
    async loadData(): Promise<unknown> { return {}; },
    async saveSettings(): Promise<void> {},
    async initializeLibrary(): Promise<void> {},
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

  it("organizes core settings into four top-level pages with titled sections", () => {
    const tab = new AnimeListSettingTab(new App(), createHost());

    assert.deepEqual(SETTINGS_PAGES.map((page) => page.label), [
      "General",
      "Search & metadata",
      "Features",
      "Maintenance",
    ]);
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
    assert.deepEqual(tab.getSettingsPageSections("maintenance").map((section) => section.heading), [
      "Library setup",
    ]);
  });

  it("supports standard keyboard navigation across the top-level pages", () => {
    assert.equal(settingsPageForKey("general", "ArrowRight"), "search-metadata");
    assert.equal(settingsPageForKey("general", "ArrowLeft"), "maintenance");
    assert.equal(settingsPageForKey("features", "Home"), "general");
    assert.equal(settingsPageForKey("features", "End"), "maintenance");
    assert.equal(settingsPageForKey("features", "Enter"), null);
  });
});
