import assert from "node:assert/strict";
import { describe, it } from "node:test";
import AnimeListPlugin from "../../src/main";
import { normalizeSpecialLabelMode } from "../../src/masterpiece-labels";
import { normalizeSearchLanguageSettings } from "../../src/multilingual-search";
import { DEFAULT_SETTINGS } from "../../src/settings";

async function loadSettings(raw: unknown): Promise<AnimeListPlugin["settings"]> {
  const plugin = Object.create(AnimeListPlugin.prototype) as AnimeListPlugin & {
    loadData(): Promise<unknown>;
  };
  plugin.loadData = async () => raw;
  await plugin.loadSettings();
  return plugin.settings;
}

describe("settings compatibility", () => {
  it("loads every core persisted field and normalizes legacy UI state", async () => {
    const settings = await loadSettings({
      interfaceLanguage: "ja-JP",
      storageMode: "flat",
      libraryRoot: "Library",
      flatMediaFolder: "Media",
      additionalScanFolders: ["Archive", 123, "Other"],
      coverFolder: "Covers",
      templateFolder: "Templates",
      timelineMaxStackDepth: 5,
      googleBooksApiKey: "  secret  ",
      tagCatalog: [" 重看 ", "收藏", "重看"],
      providers: { bangumi: false, anilist: true, openlibrary: false },
      migrations: { mediaStatus: 6 },
      uiState: {
        section: "timeline",
        type: "manga",
        status: "watching",
        genre: "戀愛",
        sort: "score-desc",
        view: "list",
      },
    });

    assert.equal(settings.interfaceLanguage, "ja");
    assert.equal(settings.storageMode, "flat");
    assert.equal(settings.flatMediaFolder, "Media");
    assert.deepEqual(settings.additionalScanFolders, ["Archive", "Other"]);
    assert.equal(settings.googleBooksApiKey, "secret");
    assert.deepEqual(settings.tagCatalog, ["重看", "收藏"]);
    assert.deepEqual(settings.providers, { bangumi: false, anilist: true, openlibrary: false });
    assert.equal(settings.migrations.mediaStatus, 6);
    assert.deepEqual(settings.uiState, {
      section: "timeline",
      type: "manga",
      status: "ongoing",
      filters: { companies: [], quarter: "", tags: ["戀愛"] },
      sort: "score-desc",
      view: "list",
    });
  });

  it("loads release tracking as an explicit opt-in feature", async () => {
    const disabled = await loadSettings({});
    assert.deepEqual(disabled.releaseTracking, {
      enabled: false,
      automatic: false,
      lastAutomaticCheckAt: "",
    });

    const enabled = await loadSettings({
      releaseTracking: { enabled: true, automatic: true, lastAutomaticCheckAt: "2026-08-08T00:00:00.000Z" },
    });
    assert.deepEqual(enabled.releaseTracking, {
      enabled: true,
      automatic: true,
      lastAutomaticCheckAt: "2026-08-08T00:00:00.000Z",
    });
  });

  it("falls back deterministically when stored settings are missing or malformed", async () => {
    const settings = await loadSettings({
      storageMode: "unknown",
      additionalScanFolders: "Archive",
      providers: { bangumi: "yes" },
      migrations: { mediaStatus: "6" },
      uiState: { type: "podcast", status: "all", view: "table" },
    });

    assert.equal(settings.interfaceLanguage, "zh-TW");
    assert.equal(settings.storageMode, DEFAULT_SETTINGS.storageMode);
    assert.deepEqual(settings.additionalScanFolders, []);
    assert.deepEqual(settings.tagCatalog, []);
    assert.deepEqual(settings.providers, DEFAULT_SETTINGS.providers);
    assert.equal(settings.migrations.mediaStatus, 0);
    assert.deepEqual(settings.uiState, DEFAULT_SETTINGS.uiState);
  });

  it("keeps feature setting normalizers backward compatible", () => {
    assert.deepEqual(normalizeSearchLanguageSettings(undefined), {
      chinese: true,
      english: true,
      original: true,
    });
    assert.deepEqual(normalizeSearchLanguageSettings({ chinese: false, english: true }), {
      chinese: false,
      english: true,
      original: true,
    });
    assert.equal(normalizeSpecialLabelMode("masterpiece"), "masterpiece");
    assert.equal(normalizeSpecialLabelMode("favorite"), "favorite");
    assert.equal(normalizeSpecialLabelMode("legacy-value"), "favorite");
  });
});

it("preserves unknown feature settings through the shared settings store", async () => {
  const saved: unknown[] = [];
  const storage = {
    async loadData(): Promise<unknown> {
      return {
        libraryRoot: "Library",
        futureFeature: { enabled: true, mode: "compact" },
        providers: { bangumi: false, futureProvider: true },
        migrations: { mediaStatus: 2, futureMigration: 7 },
        uiState: { genre: "科幻", futureLayout: "dense" },
      };
    },
    async saveData(value: unknown): Promise<void> {
      saved.push(value);
    },
  };
  const { AnimeListSettingsStore } = await import("../../src/settings-store");
  const store = new AnimeListSettingsStore(storage);
  const settings = await store.load();
  await store.save(settings);

  const persisted = saved[0] as Record<string, unknown>;
  assert.deepEqual(persisted.futureFeature, { enabled: true, mode: "compact" });
  assert.equal((persisted.providers as Record<string, unknown>).futureProvider, true);
  assert.equal((persisted.migrations as Record<string, unknown>).futureMigration, 7);
  const persistedUiState = persisted.uiState as Record<string, unknown>;
  assert.equal(persistedUiState.futureLayout, "dense");
  assert.equal("genre" in persistedUiState, false);
  assert.deepEqual(persistedUiState.filters, { companies: [], quarter: "", tags: ["科幻"] });
  assert.equal(settings.searchLanguages.original, true);
  assert.equal(settings.specialLabelMode, "favorite");
});
