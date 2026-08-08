import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App } from "obsidian";
import { AnimeListSettingTab, DEFAULT_SETTINGS } from "../src/settings";
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
    } finally {
      resetLocaleForTests();
    }
  });

  it("keeps providers and library setup in separate following sections", () => {
    const tab = new AnimeListSettingTab(new App(), createHost());
    const sections = tab.getSettingSections();

    assert.deepEqual(sections.map((section) => section.heading ?? ""), [
      "",
      "Timeline",
      "Search languages",
      "Metadata providers",
      "Library setup",
    ]);
  });
});
