import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile } from "obsidian";
import type { App } from "obsidian";
import { CleanupScanHistory, readCleanupScanHistory, saveCleanupScanHistory } from "../src/data/cleanup-scan-history";
import { completedTitleScan } from "../src/data/title-localization-service";
import { suggestCrossProviderTitle } from "../src/domain/media-title-suggestion";
import { normalizeAniListMedia, normalizeBangumiSubject } from "../src/data/provider-normalizers";
import { withActiveLocale } from "../src/i18n/catalog";

function file(path: string, mtime = 10): TFile {
  const note = new TFile();
  note.path = path;
  note.basename = path.split("/").pop() ?? "";
  note.extension = "md";
  note.stat.mtime = mtime;
  note.stat.size = 200;
  return note;
}

describe("shared Settings scan checkpoints", () => {
  it("separates tasks and locale; skips completed files but not changed files or a forced rescan", () => {
    const first = file("AnimeList/Anime/test.md");
    const book = new CleanupScanHistory();
    assert.equal(book.needsScan("titles:zh-TW", first, "pending"), true);
    book.markChecked("titles:zh-TW", first);
    assert.equal(book.needsScan("titles:zh-TW", first, "pending"), false);
    assert.equal(book.needsScan("titles:zh-CN", first, "pending"), true);
    assert.equal(book.needsScan("metadata", first, "pending"), true);
    assert.equal(book.needsScan("titles:zh-TW", first, "all"), true);
    first.stat.mtime++;
    assert.equal(book.needsScan("titles:zh-TW", first, "pending"), true);
  });

  it("persists only completed checks, survives reopen, and merges simultaneous feature writes", async () => {
    const storage = new Map<string, string>();
    const app = {
      vault: {
        configDir: ".obsidian",
        adapter: {
          exists: async (path: string) => storage.has(path),
          read: async (path: string) => {
            const value = storage.get(path);
            if (value === undefined) throw Error("Missing checkpoint");
            return value;
          },
          write: async (path: string, value: string) => { storage.set(path, value); },
        },
      },
    } as unknown as App;
    const first = file("AnimeList/Anime/a.md");
    const second = file("AnimeList/Anime/b.md");
    const initially = await readCleanupScanHistory(app);
    assert.equal(initially.needsScan("metadata", first, "pending"), true);
    await Promise.all([
      saveCleanupScanHistory(app, "metadata", [first]),
      saveCleanupScanHistory(app, "titles:zh-TW", [second]),
    ]);
    const reloaded = await readCleanupScanHistory(app);
    assert.equal(reloaded.needsScan("metadata", first, "pending"), false);
    assert.equal(reloaded.needsScan("titles:zh-TW", second, "pending"), false);
    // Failure/unconfirmed candidates were not included in checkpoints.
    assert.equal(reloaded.needsScan("metadata", second, "pending"), true);
    second.stat.size++;
    assert.equal(reloaded.needsScan("titles:zh-TW", second, "pending"), true);
    assert.equal(storage.size, 1);
  });
});

describe("title scan checkpoint contract", () => {
  it("does not requery confirmed no-match scans, but revisits errors and unapplied proposals", () => {
    for (const status of ["ready", "review", "lookup-failed"] as const) {
      assert.equal(completedTitleScan(status), false, status);
    }
    for (const status of ["unchanged", "custom-title", "no-source",
      "no-translation", "ambiguous"] as const) {
      assert.equal(completedTitleScan(status), true, status);
    }
  });
});

describe("independent cross-provider title suggestions", () => {
  const original = "かぐや様は告らせたい";
  function anilist(year = 2019) {
    return withActiveLocale("zh-TW", () => normalizeAniListMedia({
      id: 101921, countryOfOrigin: "JP", title: {
        native: original, romaji: "Kaguya-sama wa Kokurasetai",
        english: "Kaguya-sama: Love is War",
      },
      startDate: { year, month: 1, day: 12 },
    }, "anime"));
  }
  function bangumi(id = 248175, year = "2019-01-12") {
    return withActiveLocale("zh-TW", () => normalizeBangumiSubject({
      id, name: original, name_cn: "辉夜大小姐想让我告白",
      date: year, infobox: [],
    }, "anime"));
  }

  it("offers an explicitly unverified translated-title proposal without merging provider IDs", () => {
    const ani = anilist();
    const suggestion = suggestCrossProviderTitle(ani, [bangumi()], "zh-TW");
    assert.equal(suggestion?.provider, "bangumi");
    assert.equal(suggestion?.sourceId, "248175");
    assert.equal(suggestion?.title, "輝夜大小姐想讓我告白");
    assert.equal(ani.sourceId, "101921");
    assert.equal(ani.titleVariants?.localized?.["zh-TW"], undefined);
    assert.equal(ani.titleSuggestion, undefined);
  });

  it("rejects ambiguous works, wrong year, incorrect original title and incompatible media type", () => {
    const ani = anilist();
    assert.equal(suggestCrossProviderTitle(ani, [bangumi(), bangumi(999)], "zh-TW"), null);
    assert.equal(suggestCrossProviderTitle(ani, [bangumi(248175, "2018-01-12")], "zh-TW"), null);
    assert.equal(suggestCrossProviderTitle(ani, [{
      ...bangumi(), originalTitle: "まったく違う作品",
    }], "zh-TW"), null);
    assert.equal(suggestCrossProviderTitle(ani, [{
      ...bangumi(), mediaType: "manga",
    }], "zh-TW"), null);
  });

  it("does not suggest another provider's title when an official variant is already available", () => {
    const ani = { ...anilist(), titleVariants: {
      fallback: "English title", localized: { "zh-TW": "既有正式繁體" },
    } };
    assert.equal(suggestCrossProviderTitle(ani, [bangumi()], "zh-TW"), null);
  });
});
