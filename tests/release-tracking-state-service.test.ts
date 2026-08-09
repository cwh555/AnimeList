import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile } from "obsidian";
import { ReleaseTrackingService } from "../src/data/release-tracking-service";
import { ReleaseTrackingStateService } from "../src/data/release-tracking-state-service";
import type { MangaDexReleaseClient } from "../src/data/providers/mangadex-release-client";
import type { NdlReleaseClient } from "../src/data/providers/ndl-release-client";
import type { MediaItem } from "../src/domain/media-types";

function harness(initial: Record<string, unknown>) {
  const file = new TFile();
  file.path = "AnimeList/Manga/Test.md";
  file.basename = "Test";
  const frontmatter = { ...initial };
  const app = {
    vault: {
      getAbstractFileByPath(path: string) { return path === file.path ? file : null; },
    },
    metadataCache: {
      getFileCache(target: TFile) { return target === file ? { frontmatter } : null; },
    },
    fileManager: {
      async processFrontMatter(target: TFile, apply: (value: Record<string, unknown>) => void) {
        assert.equal(target, file);
        apply(frontmatter);
      },
    },
  };
  return { app: app as any, file, frontmatter };
}

function item(path: string, mediaType: "manga" | "novel" = "manga"): MediaItem {
  return {
    title: "Test",
    originalTitle: "Test",
    mediaType,
    format: mediaType === "manga" ? "manga" : "light_novel",
    status: "ongoing",
    releaseStatus: "releasing",
    progress: mediaType === "manga" ? 120 : 8,
    total: 0,
    unit: mediaType === "manga" ? "chapter" : "volume",
    score: null,
    favorite: false,
    year: 2026,
    genres: [],
    people: [],
    platforms: [],
    sourceUrls: [],
    cover: "",
    filePath: path,
    updated: 0,
    updatedLabel: "",
    startedAt: "",
    completedAt: "",
    volumeLog: [],
  };
}

describe("release tracking persistence", () => {
  it("writes verified release metadata without touching reading progress or unrelated frontmatter", async () => {
    const { app, file, frontmatter } = harness({
      progress: 120,
      progress_unit: "chapter",
      custom_field: "keep-me",
      release_status: "releasing",
    });
    const service = new ReleaseTrackingStateService(app);
    await service.writeVerified(
      file.path,
      "manga",
      { provider: "mangadex", sourceId: "series-1", title: "Test" },
      "147",
      "",
      "https://mangadex.org/title/series-1",
    );

    assert.equal(frontmatter.progress, 120);
    assert.equal(frontmatter.progress_unit, "chapter");
    assert.equal(frontmatter.release_status, "releasing");
    assert.equal(frontmatter.custom_field, "keep-me");
    assert.equal(frontmatter.latest_chapter, "147");
    assert.equal(frontmatter.release_tracking_status, "verified");
    assert.equal(frontmatter.release_tracking_ref, "series-1");
    assert.equal(typeof frontmatter.release_tracking_checked_at, "string");
    assert.equal("release_tracking_verified_at" in frontmatter, false);
  });

  it("auto-binds a high-confidence novel publication line and writes only release metadata", async () => {
    const { app, file, frontmatter } = harness({ progress: 8, progress_unit: "volume" });
    const mangaDex = {} as MangaDexReleaseClient;
    const ndl = {
      async searchCatalog(catalog: "jpro-book" | "ndl-national") {
        return [
          { sourceId: "book-8", catalog, sourceUrl: "https://ndlsearch.ndl.go.jp/books/book-8", title: "Example Novel", seriesTitle: "Example文庫 ; ex-8", volume: "8", creators: ["Author"], publisher: "Old Publisher", publishedAt: "2025", isbn: "" },
          { sourceId: "book-9", catalog, sourceUrl: "https://ndlsearch.ndl.go.jp/books/book-9", title: "Example Novel", seriesTitle: "Example文庫 ; ex-9", volume: "9", creators: ["Author"], publisher: "New Publisher", publishedAt: "2026", isbn: "9784000000000" },
          { sourceId: "comic-10", catalog, sourceUrl: "https://ndlsearch.ndl.go.jp/books/comic-10", title: "Example Novel", seriesTitle: "Exampleコミックス", volume: "10", creators: ["Author", "Artist"], publisher: "Comic Publisher", publishedAt: "2026", isbn: "" },
        ];
      },
    } as unknown as NdlReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex, ndl });
    const novel = item(file.path, "novel");
    novel.title = "Example Novel";
    novel.originalTitle = "Example Novel";
    novel.people = ["Author"];

    const result = await service.refreshItem(novel);
    assert.equal(result.kind, "initialized");
    assert.equal(result.status, "verified");
    assert.equal(frontmatter.latest_volume, "9");
    assert.equal(frontmatter.release_tracking_imprint, "Example文庫");
    assert.equal(frontmatter.release_tracking_status, "verified");
    assert.equal(frontmatter.progress, 8);
  });

  it("recovers a Toradora main-line binding from a previously stored spin-off volume 3", async () => {
    const { app, file, frontmatter } = harness({
      progress: 8,
      progress_unit: "volume",
      release_tracking_provider: "ndl-jpro",
      release_tracking_title: "とらドラ!",
      release_tracking_creator: "竹宮ゆゆこ",
      release_tracking_imprint: "電撃文庫",
      release_tracking_status: "verified",
      latest_volume: "3",
      latest_release_date: "2010-04-10",
    });
    const ndl = {
      async searchCatalog(catalog: "jpro-book" | "ndl-national") {
        return [
          { sourceId: "main-10", catalog, sourceUrl: "https://ndlsearch.ndl.go.jp/books/main-10", title: "とらドラ!", seriesTitle: "電撃文庫 ; 1807", volume: "10", creators: ["竹宮ゆゆこ"], publisher: "アスキー・メディアワークス", publishedAt: "2009-03-10", isbn: "9784048675932" },
          { sourceId: "spin-3", catalog, sourceUrl: "https://ndlsearch.ndl.go.jp/books/spin-3", title: "とらドラ・スピンオフ3! 俺の弁当を見てくれ", seriesTitle: "電撃文庫", volume: "3", creators: ["竹宮ゆゆこ"], publisher: "アスキー・メディアワークス", publishedAt: "2010-04-10", isbn: "9784048684569" },
        ];
      },
    } as unknown as NdlReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex: {} as MangaDexReleaseClient, ndl });
    const novel = item(file.path, "novel");
    novel.title = "虎與龍";
    novel.originalTitle = "とらドラ!";
    novel.people = ["竹宮ゆゆこ"];

    const result = await service.refreshItem(novel);
    assert.equal(result.kind, "updated");
    assert.equal(result.before, "3");
    assert.equal(result.after, "10");
    assert.equal(frontmatter.latest_volume, "10");
    assert.equal(frontmatter.latest_release_date, "2009-03-10");
    assert.equal(frontmatter.release_tracking_status, "verified");
  });

  it("refuses a numeric provider latest below the user's recorded reading progress", async () => {
    const { app, file, frontmatter } = harness({ progress: 8, progress_unit: "volume" });
    const ndl = {
      async searchCatalog(catalog: "jpro-book" | "ndl-national") {
        return [
          { sourceId: "book-3", catalog, sourceUrl: "https://ndlsearch.ndl.go.jp/books/book-3", title: "Example Novel", seriesTitle: "Example文庫", volume: "3", creators: ["Author"], publisher: "Publisher", publishedAt: "2026-01-01", isbn: "" },
        ];
      },
    } as unknown as NdlReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex: {} as MangaDexReleaseClient, ndl });
    const novel = item(file.path, "novel");
    novel.title = "Example Novel";
    novel.originalTitle = "Example Novel";
    novel.people = ["Author"];

    const result = await service.refreshItem(novel);
    assert.equal(result.kind, "attention");
    assert.equal(result.status, "source_regressed");
    assert.equal(frontmatter.latest_volume, undefined);
    assert.equal(frontmatter.progress, 8);
  });

  it("auto-selects the original MangaDex work when colored editions share the exact title", async () => {
    const { app, file, frontmatter } = harness({ progress: 120, progress_unit: "chapter" });
    const mangaDex = {
      async search() {
        return [
          { id: "original", title: "Kaguya-sama: Love Is War", altTitles: ["かぐや様は告らせたい～天才たちの恋愛頭脳戦～"], sourceUrl: "https://mangadex.org/title/original" },
          { id: "fan", title: "Kaguya-sama wa Kokurasetai (Fan Colored)", altTitles: ["かぐや様は告らせたい～天才たちの恋愛頭脳戦～"], sourceUrl: "https://mangadex.org/title/fan" },
          { id: "official", title: "Kaguya-sama: Love Is War (Official Colored)", altTitles: ["かぐや様は告らせたい～天才たちの恋愛頭脳戦～"], sourceUrl: "https://mangadex.org/title/official" },
        ];
      },
      async latestChapter(sourceId: string) { assert.equal(sourceId, "original"); return "281"; },
    } as unknown as MangaDexReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex, ndl: {} as NdlReleaseClient });
    const manga = item(file.path, "manga");
    manga.title = "輝夜姬想讓人告白";
    manga.originalTitle = "かぐや様は告らせたい～天才たちの恋愛頭脳戦～";

    const result = await service.refreshItem(manga);
    assert.equal(result.kind, "initialized");
    assert.equal(result.after, "281");
    assert.equal(frontmatter.release_tracking_ref, "original");
    assert.equal(frontmatter.latest_chapter, "281");
  });

  it("reports visible start and completion progress for every manual-refresh item", async () => {
    const { app, file } = harness({
      progress: 120,
      progress_unit: "chapter",
      release_tracking_provider: "mangadex",
      release_tracking_ref: "series-1",
      release_tracking_title: "Test",
      release_tracking_status: "verified",
      latest_chapter: "147",
    });
    const mangaDex = {
      async latestChapter() { return "148"; },
    } as unknown as MangaDexReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex, ndl: {} as NdlReleaseClient });
    const events: Array<[string, number, number]> = [];

    const summary = await service.refreshAll([item(file.path)], (progress) => {
      events.push([progress.stage, progress.completed, progress.total]);
    });

    assert.deepEqual(events, [["checking", 0, 1], ["completed", 1, 1]]);
    assert.equal(summary.updated, 1);
  });

  it("finishes all provider reads before persisting refresh results", async () => {
    const { app, file } = harness({
      progress: 120,
      progress_unit: "chapter",
      release_tracking_provider: "mangadex",
      release_tracking_ref: "series-1",
      release_tracking_title: "Test",
      release_tracking_status: "verified",
      latest_chapter: "147",
    });
    const originalProcessFrontMatter = app.fileManager.processFrontMatter.bind(app.fileManager);
    let writes = 0;
    app.fileManager.processFrontMatter = async (...args: any[]) => {
      writes += 1;
      return originalProcessFrontMatter(...args);
    };
    let providerReads = 0;
    const mangaDex = {
      async latestChapter() {
        providerReads += 1;
        if (providerReads === 2) assert.equal(writes, 0);
        return "148";
      },
    } as unknown as MangaDexReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex, ndl: {} as NdlReleaseClient });

    const summary = await service.refreshAll([item(file.path), item(file.path)]);

    assert.equal(providerReads, 2);
    assert.equal(writes, 1);
    assert.equal(summary.updated, 2);
  });

  it("persists provider failures while preserving the last verified release", async () => {
    const { app, file, frontmatter } = harness({
      progress: 120,
      release_tracking_provider: "mangadex",
      release_tracking_ref: "series-1",
      release_tracking_title: "Test",
      release_tracking_status: "verified",
      latest_chapter: "147",
    });
    const mangaDex = {
      async search() { return []; },
      async latestChapter() { throw new Error("temporary outage"); },
    } as unknown as MangaDexReleaseClient;
    const ndl = {} as NdlReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex, ndl });
    const result = await service.refreshItem(item(file.path));

    assert.equal(result.kind, "attention");
    assert.equal(result.status, "provider_error");
    assert.equal(frontmatter.latest_chapter, "147");
    assert.equal(frontmatter.progress, 120);
    assert.equal(frontmatter.release_tracking_status, "provider_error");
    assert.equal(frontmatter.release_tracking_error, "temporary outage");
  });

  it("uses one JPRO request for a safely matched first-time novel and persists the trusted catalog", async () => {
    const { app, file, frontmatter } = harness({ progress: 12, progress_unit: "volume" });
    let calls = 0;
    const ndl = {
      async searchCatalog(catalog: "jpro-book" | "ndl-national", title: string) {
        calls += 1;
        assert.equal(catalog, "jpro-book");
        assert.equal(title, "ロクでなし魔術講師と禁忌教典");
        return [
          { sourceId: "23", sourceUrl: "https://ndl/23", title: "ロクでなし魔術講師と禁忌教典(アカシックレコード)", alternativeTitles: [title], seriesTitle: "", volume: "23", creators: ["羊太郎"], publisher: "KADOKAWA", publishedAt: "2023-06-20", isbn: "", catalog },
          { sourceId: "24", sourceUrl: "https://ndl/24", title: "ロクでなし魔術講師と禁忌教典(アカシックレコード)", alternativeTitles: [title], seriesTitle: "富士見ファンタジア文庫", volume: "24", creators: ["羊太郎"], publisher: "KADOKAWA", publishedAt: "2023-11-17", isbn: "", catalog },
        ];
      },
    } as unknown as NdlReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex: {} as MangaDexReleaseClient, ndl });
    const novel = item(file.path, "novel");
    novel.title = "不正經的魔術講師與禁忌教典";
    novel.originalTitle = "ロクでなし魔術講師と禁忌教典";
    novel.people = ["羊太郎"];
    novel.progress = 12;

    const result = await service.refreshItem(novel);
    assert.equal(result.kind, "initialized");
    assert.equal(result.after, "24");
    assert.equal(calls, 1);
    assert.equal(frontmatter.release_tracking_catalog, "jpro-book");
    assert.equal(frontmatter.release_tracking_status, "verified");
  });

  it("reuses a persisted trusted NDL catalog on the next refresh without screening the other catalog", async () => {
    const { app, file } = harness({
      progress: 8,
      progress_unit: "volume",
      release_tracking_provider: "ndl-jpro",
      release_tracking_title: "オーバーロード",
      release_tracking_creator: "丸山くがね",
      release_tracking_catalog: "ndl-national",
      release_tracking_status: "verified",
      latest_volume: "16",
      latest_release_date: "2022-07-29",
    });
    const calls: string[] = [];
    const ndl = {
      async searchCatalog(catalog: "jpro-book" | "ndl-national") {
        calls.push(catalog);
        return [{ sourceId: "16", sourceUrl: "https://ndl/16", title: "オーバーロード16 半森妖精の神人 下", seriesTitle: "", volume: "16", creators: ["丸山くがね"], publisher: "KADOKAWA", publishedAt: "2022-07-29", isbn: "", catalog }];
      },
    } as unknown as NdlReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex: {} as MangaDexReleaseClient, ndl });
    const novel = item(file.path, "novel");
    novel.title = "OVERLORD";
    novel.originalTitle = "オーバーロード";
    novel.people = ["丸山くがね"];

    const result = await service.refreshItem(novel);
    assert.equal(result.kind, "unchanged");
    assert.deepEqual(calls, ["ndl-national"]);
  });

  it("falls back to the other NDL catalog only when the stored catalog cannot safely verify the binding", async () => {
    const { app, file, frontmatter } = harness({
      progress: 8,
      progress_unit: "volume",
      release_tracking_provider: "ndl-jpro",
      release_tracking_title: "Example Novel",
      release_tracking_creator: "Author",
      release_tracking_imprint: "Example文庫",
      release_tracking_catalog: "jpro-book",
      release_tracking_status: "verified",
      latest_volume: "8",
      latest_release_date: "2025-01-01",
    });
    const calls: string[] = [];
    const ndl = {
      async searchCatalog(catalog: "jpro-book" | "ndl-national") {
        calls.push(catalog);
        if (catalog === "jpro-book") return [];
        return [{ sourceId: "9", sourceUrl: "https://ndl/9", title: "Example Novel", seriesTitle: "Example文庫", volume: "9", creators: ["Author"], publisher: "Publisher", publishedAt: "2026-01-01", isbn: "", catalog }];
      },
    } as unknown as NdlReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex: {} as MangaDexReleaseClient, ndl });
    const novel = item(file.path, "novel");
    novel.title = novel.originalTitle = "Example Novel";
    novel.people = ["Author"];

    const result = await service.refreshItem(novel);
    assert.equal(result.kind, "updated");
    assert.deepEqual(calls, ["jpro-book", "ndl-national"]);
    assert.equal(frontmatter.release_tracking_catalog, "ndl-national");
  });

  it("keeps post-finale side publications in result notes without changing the main latest volume", async () => {
    const { app, file } = harness({ progress: 10, progress_unit: "volume" });
    const ndl = {
      async searchCatalog(catalog: "jpro-book" | "ndl-national") {
        return [
          { sourceId: "main-10", sourceUrl: "https://ndl/main-10", title: "とらドラ!", seriesTitle: "電撃文庫", volume: "10", creators: ["竹宮ゆゆこ"], publisher: "KADOKAWA", publishedAt: "2009-03-10", isbn: "", catalog },
          { sourceId: "spin-3", sourceUrl: "https://ndl/spin-3", title: "とらドラ・スピンオフ3! 俺の弁当を見てくれ", seriesTitle: "電撃文庫", volume: "3", creators: ["竹宮ゆゆこ"], publisher: "KADOKAWA", publishedAt: "2010-04-10", isbn: "", catalog },
        ];
      },
    } as unknown as NdlReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex: {} as MangaDexReleaseClient, ndl });
    const novel = item(file.path, "novel");
    novel.title = "虎與龍";
    novel.originalTitle = "とらドラ!";
    novel.people = ["竹宮ゆゆこ"];
    novel.progress = 10;

    const result = await service.refreshItem(novel);
    assert.equal(result.after, "10");
    assert.equal(result.notes.length, 1);
    assert.match(result.notes[0] ?? "", /スピンオフ3/);
  });

  it("persists a manually selected binding atomically instead of returning to ambiguous state", async () => {
    const { app, file, frontmatter } = harness({ progress: 12, progress_unit: "volume", release_tracking_status: "ambiguous" });
    const ndl = {
      async searchCatalog(catalog: "jpro-book" | "ndl-national") {
        return [{ sourceId: "24", sourceUrl: "https://ndl/24", title: "ロクでなし魔術講師と禁忌教典", seriesTitle: "富士見ファンタジア文庫", volume: "24", creators: ["羊太郎"], publisher: "KADOKAWA", publishedAt: "2023-11-17", isbn: "", catalog }];
      },
    } as unknown as NdlReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex: {} as MangaDexReleaseClient, ndl });
    const novel = item(file.path, "novel");
    novel.title = "不正經的魔術講師與禁忌教典";
    novel.originalTitle = "ロクでなし魔術講師と禁忌教典";
    novel.people = ["羊太郎"];
    novel.progress = 12;

    const result = await service.refreshItem(novel, {
      provider: "ndl-jpro",
      title: "ロクでなし魔術講師と禁忌教典",
      creator: "羊太郎",
      imprint: "富士見ファンタジア文庫",
      catalog: "jpro-book",
    });
    assert.equal(result.status, "verified");
    assert.equal(frontmatter.release_tracking_status, "verified");
    assert.equal(frontmatter.release_tracking_title, "ロクでなし魔術講師と禁忌教典");
    assert.equal(frontmatter.release_tracking_catalog, "jpro-book");
  });

  it("returns a newly unique novel candidate for stale attention and verifies it without a second catalog request", async () => {
    const { app, file, frontmatter } = harness({ progress: 12, progress_unit: "volume", release_tracking_status: "ambiguous" });
    let calls = 0;
    const ndl = {
      async searchCatalog(catalog: "jpro-book" | "ndl-national") {
        calls += 1;
        return [{ sourceId: "24", sourceUrl: "https://ndl/24", title: "ロクでなし魔術講師と禁忌教典", seriesTitle: "富士見ファンタジア文庫", volume: "24", creators: ["羊太郎"], publisher: "KADOKAWA", publishedAt: "2023-11-17", isbn: "", catalog }];
      },
    } as unknown as NdlReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex: {} as MangaDexReleaseClient, ndl });
    const novel = item(file.path, "novel");
    novel.title = "不正經的魔術講師與禁忌教典";
    novel.originalTitle = "ロクでなし魔術講師と禁忌教典";
    novel.people = ["羊太郎"];
    novel.progress = 12;

    const candidates = await service.matchCandidates(novel);
    assert.equal(candidates.length, 1);
    assert.equal(calls, 1);
    const result = await service.refreshItem(novel, candidates[0]?.binding);
    assert.equal(result.status, "verified");
    assert.equal(result.after, "24");
    assert.equal(calls, 1);
    assert.equal(frontmatter.release_tracking_status, "verified");
  });

  it("excludes titles disabled in Settings from refresh totals and provider requests", async () => {
    const disabled = harness({ release_tracking_status: "disabled", progress: 120, progress_unit: "chapter" });
    const enabled = harness({ release_tracking_provider: "mangadex", release_tracking_ref: "series-1", release_tracking_status: "verified", latest_chapter: "147", progress: 120, progress_unit: "chapter" });
    enabled.file.path = "AnimeList/Manga/Enabled.md";
    const app = {
      vault: { getAbstractFileByPath(path: string) { return path === disabled.file.path ? disabled.file : path === enabled.file.path ? enabled.file : null; } },
      metadataCache: { getFileCache(target: TFile) { return target === disabled.file ? { frontmatter: disabled.frontmatter } : target === enabled.file ? { frontmatter: enabled.frontmatter } : null; } },
      fileManager: { async processFrontMatter(target: TFile, apply: (value: Record<string, unknown>) => void) { apply(target === disabled.file ? disabled.frontmatter : enabled.frontmatter); } },
    } as any;
    let requests = 0;
    const mangaDex = { async latestChapter() { requests += 1; return "148"; } } as unknown as MangaDexReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex, ndl: {} as NdlReleaseClient });
    const progress: number[] = [];
    const summary = await service.refreshAll([item(disabled.file.path), item(enabled.file.path)], (event) => progress.push(event.total));
    assert.equal(requests, 1);
    assert.deepEqual(progress, [1, 1]);
    assert.equal(summary.checked, 1);
  });

  it("re-enables a Settings-disabled work without erasing its existing release binding or latest value", async () => {
    const { app, file, frontmatter } = harness({
      release_tracking_status: "disabled",
      release_tracking_provider: "ndl-jpro",
      release_tracking_title: "Example Novel",
      release_tracking_catalog: "jpro-book",
      latest_volume: "9",
    });
    const state = new ReleaseTrackingStateService(app);
    assert.equal(await state.enable(file.path, "novel"), true);
    assert.equal(frontmatter.release_tracking_status, "unconfigured");
    assert.equal(frontmatter.release_tracking_title, "Example Novel");
    assert.equal(frontmatter.release_tracking_catalog, "jpro-book");
    assert.equal(frontmatter.latest_volume, "9");
  });

});
