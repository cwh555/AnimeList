import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App } from "obsidian";
import { AnimeListSettingTab, DEFAULT_SETTINGS } from "../src/settings";

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

  it("keeps providers and library setup in separate following sections", () => {
    const tab = new AnimeListSettingTab(new App(), createHost());
    const sections = tab.getSettingSections();

    assert.deepEqual(sections.map((section) => section.heading ?? ""), [
      "",
      "Search languages",
      "Metadata providers",
      "Library setup",
    ]);
  });
});

