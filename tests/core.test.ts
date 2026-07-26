import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { App, TFile, TFolder } from "obsidian";
import AnimeListPlugin from "../src/main";
import { BUILTIN_TEMPLATES, getBuiltInTemplateOptions } from "../src/builtin-templates";
import { AnimeListSettingTab, DEFAULT_SETTINGS } from "../src/settings";
import { legacyTest } from "../src/legacy";
import { getScopedMarkdownFiles } from "../src/vault-scope";
import {
  compareVolumeLabels,
  expandTimelineEntries,
  normalizeVolumeLabel,
  normalizeVolumeLog,
  progressRatio,
  serializeVolumeLog,
} from "../src/novel-progress";
import { UI_TEXT, mediaFormatLabel, mediaProviderLabel, statusFilterOptions, uiText } from "../src/ui-text";
import { rankSearchResults, searchQueryVariants } from "../src/search";
import {
  MIN_TIMELINE_VIEW_SCALE,
  calculateDefaultTimelineView,
} from "../src/timeline-scale";

const PathExists = existsSync;

const {
  assignTimelineLanes,
  buildMediaMarkdown,
  completedProgress,
  compareTimelineEntries,
  dedupeSearchResults,
  filterTimelineEntries,
  normalizeDateParts,
  normalizeGenres,
  sanitizePathPart,
} = legacyTest;

describe("media normalization", () => {
  it("normalizes common genre names to Traditional Chinese", () => {
    assert.deepEqual(
      normalizeGenres(["Romance", "恋爱", "Comedy", "Slice of Life"]),
      ["戀愛", "喜劇", "日常"],
    );
  });

  it("sanitizes file names", () => {
    assert.equal(sanitizePathPart('A/B: C? "D"'), "A B C D");
  });
});

const baseResult = {
  provider: "anilist",
  sourceId: "1",
  sourceUrl: "https://anilist.co/anime/1",
  mediaType: "anime",
  title: "Example",
  originalTitle: "原題",
  romajiTitle: "Example",
  format: "tv",
  year: 2026,
  coverUrl: "https://example.com/cover.jpg",
  genres: ["Romance"],
  rawGenres: ["Romance"],
  people: ["Studio"],
  platforms: [],
  total: 12,
  unit: "episode",
  summary: "Summary",
};

describe("external search fallbacks", () => {
  it("broadens season and translated-subtitle queries without replacing the original query", () => {
    assert.deepEqual(
      searchQueryVariants("輝夜姬想讓人告白第二季"),
      ["輝夜姬想讓人告白第二季", "輝夜姬想讓人告白"],
    );
    assert.deepEqual(
      searchQueryVariants("輝夜姬想讓人告白 永不結束的初吻"),
      ["輝夜姬想讓人告白 永不結束的初吻", "輝夜姬想讓人告白", "永不結束的初吻"],
    );
  });

  it("ranks the requested season from provider synonyms ahead of other seasons", () => {
    const common = {
      provider: "anilist", sourceUrl: "", mediaType: "anime", format: "tv", year: 2020, coverUrl: "",
      genres: [], rawGenres: [], people: [], platforms: [], total: 12, unit: "episode", summary: "",
      externalScore: null, releaseStatus: "finished", originalTitle: "", romajiTitle: "",
    } as const;
    const ranked = rankSearchResults([
      { ...common, sourceId: "101921", title: "Kaguya-sama: Love is War", searchTitles: ["辉夜大小姐想让我告白"] },
      { ...common, sourceId: "112641", title: "Kaguya-sama: Love is War?", searchTitles: ["Kaguya-sama: Love is War Season 2", "辉夜大小姐想让我告白 第二季"] },
      { ...common, sourceId: "125367", title: "Kaguya-sama: Love is War -Ultra Romantic-", searchTitles: ["Kaguya-sama: Love is War Season 3", "辉夜大小姐想让我告白 第三季"] },
    ], "輝夜姬想讓人告白第二季");

    assert.equal(ranked[0].sourceId, "112641");
  });

  it("does not collapse distinct seasons whose English titles differ only by punctuation", () => {
    const common = {
      provider: "anilist", sourceUrl: "", mediaType: "anime", format: "tv", year: 2020, coverUrl: "",
      genres: [], rawGenres: [], people: [], platforms: [], total: 12, unit: "episode", summary: "",
      externalScore: null, releaseStatus: "finished", originalTitle: "", romajiTitle: "",
    } as const;
    const results = dedupeSearchResults([
      { ...common, sourceId: "101921", title: "Kaguya-sama: Love is War" },
      { ...common, sourceId: "112641", title: "Kaguya-sama: Love is War?" },
    ]);

    assert.deepEqual(results.map((result) => result.sourceId), ["101921", "112641"]);
  });

  it("queries broader provider result sets and merges every generated query", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    assert.match(mainSource, /const queries = searchQueryVariants\(query\)/);
    assert.match(mainSource, /queries\.map\(\(candidate\) => this\.searchBangumi/);
    assert.match(mainSource, /queries\.map\(\(candidate\) => this\.searchAniList/);
    assert.match(mainSource, /search\/subjects\?limit=20&offset=0/);
    assert.match(mainSource, /Page\(page: 1, perPage: 20\)/);
    assert.match(mainSource, /rankSearchResults\(deduped, query\)/);
  });

  it("merges fallback provider responses and returns the requested second season", async () => {
    const common = {
      provider: "anilist", sourceUrl: "", mediaType: "anime", format: "tv", year: 2020, coverUrl: "",
      genres: [], rawGenres: [], people: [], platforms: [], total: 12, unit: "episode", summary: "",
      externalScore: null, releaseStatus: "finished", originalTitle: "", romajiTitle: "",
    } as const;
    const calls: string[] = [];
    const plugin = Object.create(AnimeListPlugin.prototype) as AnimeListPlugin & {
      searchBangumi: (mediaType: string, query: string) => Promise<typeof common[]>;
      searchAniList: (mediaType: string, query: string) => Promise<Array<typeof common & { sourceId: string; title: string; searchTitles: string[] }>>;
    };
    plugin.settings = structuredClone(DEFAULT_SETTINGS);
    plugin.settings.providers.openlibrary = false;
    plugin.searchBangumi = async (_mediaType, query) => { calls.push(`bangumi:${query}`); return []; };
    plugin.searchAniList = async (_mediaType, query) => {
      calls.push(`anilist:${query}`);
      if (query !== "輝夜姬想讓人告白") return [];
      return [
        { ...common, year: 2019, sourceId: "101921", title: "Kaguya-sama: Love is War", searchTitles: ["辉夜大小姐想让我告白"] },
        { ...common, year: 2020, sourceId: "112641", title: "Kaguya-sama: Love is War?", searchTitles: ["Kaguya-sama: Love is War Season 2", "辉夜大小姐想让我告白 第二季"] },
      ];
    };

    const response = await plugin.searchExternal("anime", "輝夜姬想讓人告白第二季");
    assert.equal(response.results[0].sourceId, "112641");
    assert.ok(calls.includes("bangumi:輝夜姬想讓人告白第二季"));
    assert.ok(calls.includes("bangumi:輝夜姬想讓人告白"));
    assert.ok(calls.includes("anilist:輝夜姬想讓人告白第二季"));
    assert.ok(calls.includes("anilist:輝夜姬想讓人告白"));
  });

  it("keeps a translated subtitle result returned by a broader query", async () => {
    const plugin = Object.create(AnimeListPlugin.prototype) as AnimeListPlugin & {
      searchBangumi: (mediaType: string, query: string) => Promise<any[]>;
      searchAniList: (mediaType: string, query: string) => Promise<any[]>;
    };
    plugin.settings = structuredClone(DEFAULT_SETTINGS);
    plugin.settings.providers.anilist = false;
    plugin.settings.providers.openlibrary = false;
    plugin.searchAniList = async () => [];
    plugin.searchBangumi = async (_mediaType, query) => query === "輝夜姬想讓人告白"
      ? [{
        ...baseResult, provider: "bangumi", sourceId: "425211", sourceUrl: "", mediaType: "anime",
        title: "辉夜大小姐想让我告白-初吻不会结束-", originalTitle: "かぐや様は告らせたい-ファーストキッスは終わらない-",
        romajiTitle: "", format: "special", year: 2022, coverUrl: "", rawGenres: [], people: [], platforms: [],
        externalScore: null, releaseStatus: "finished", searchTitles: ["輝夜姬想讓人告白－永不結束的初吻－"],
      }]
      : [];

    const response = await plugin.searchExternal("anime", "輝夜姬想讓人告白 永不結束的初吻");
    assert.equal(response.results.some((result) => result.sourceId === "425211"), true);
  });
});

describe("segmented date input", () => {
  it("normalizes only complete real calendar dates", () => {
    assert.equal(normalizeDateParts("2026", "07", "21"), "2026-07-21");
    assert.equal(normalizeDateParts("2026", "02", "29"), "");
    assert.equal(normalizeDateParts("2024", "02", "29"), "2024-02-29");
    assert.equal(normalizeDateParts("2026", "7", "21"), "");
  });

  it("advances year, month, and day segments at consistent lengths", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");

    assert.match(legacySource, /\[year, 4, "YYYY", uiText\("date\.year"\)\]/);
    assert.match(legacySource, /\[month, 2, "MM", uiText\("date\.month"\)\]/);
    assert.match(legacySource, /\[day, 2, "DD", uiText\("date\.day"\)\]/);
    assert.match(legacySource, /bindSegment\(year, 4, month\)/);
    assert.match(legacySource, /bindSegment\(month, 2, day\)/);
    assert.match(legacySource, /bindSegment\(day, 2\)/);
    assert.match(legacySource, /if \(type === "date"\) return createDateInput\(value\)/);
    assert.match(stylesheet, /\.al-date-input \{/);
  });
});

describe("media note generation", () => {
  it("forces completed progress to the total", () => {
    assert.equal(completedProgress("completed", 12, 3), 12);
    assert.equal(completedProgress("watching", 12, 3), 3);
  });

  it("creates Markdown without a custom updated timestamp", () => {
    const markdown = buildMediaMarkdown(baseResult, {
      title: "Example",
      score: 8.5,
      status: "completed",
      startedAt: "2026-01-01",
      completedAt: "2026-01-02",
      progress: 3,
      total: 12,
      unit: "episode",
      favorite: true,
      genres: ["Romance"],
      releaseStatus: "unknown",
      volumeLog: [],
    }, "AnimeList/Covers/anime/example.webp", BUILTIN_TEMPLATES["builtin:anime-review"]);

    assert.ok(markdown.includes('title: "Example"'));
    assert.ok(markdown.includes("progress: 12"));
    assert.ok(markdown.includes('completed_at: "2026-01-02"'));
    assert.ok(!markdown.includes("updated_at:"));
    const body = markdown.split("---").slice(2).join("---").trim();
    assert.match(
      body,
      /^# Example\n\n```animelist-detail\n```\n\n!\[\[AnimeList\/Covers\/anime\/example\.webp\|260]]\n\n> Added on \d{4}-\d{2}-\d{2} at \d{2}:\d{2}\.$/,
    );
    assert.ok(!body.includes("## 作品簡介"));
    assert.ok(!body.includes("## 資料來源"));
  });
  it("requires a score only after a work is marked completed", () => {
    const planned = buildMediaMarkdown(baseResult, {
      title: "Planned anime",
      score: null,
      status: "planned",
      startedAt: "",
      completedAt: "",
      progress: 0,
      total: 12,
      unit: "episode",
      favorite: false,
      genres: [],
      releaseStatus: "unknown",
      volumeLog: [],
    }, "", "");
    assert.doesNotMatch(planned, /^score:/m);
    assert.throws(() => buildMediaMarkdown(baseResult, {
      title: "Completed anime",
      score: null,
      status: "completed",
      startedAt: "",
      completedAt: "2026-07-20",
      progress: 12,
      total: 12,
      unit: "episode",
      favorite: false,
      genres: [],
      releaseStatus: "unknown",
      volumeLog: [],
    }, "", ""), /必須填寫評分/);
  });
});


describe("serial progress and novel volume records", () => {
  it("accepts integer, half-volume, and EX labels with deterministic ordering", () => {
    assert.equal(normalizeVolumeLabel("7.5"), "7.5");
    assert.equal(normalizeVolumeLabel(".5"), "0.5");
    assert.equal(normalizeVolumeLabel("ex"), "EX");
    assert.equal(normalizeVolumeLabel("7.2"), null);
    assert.ok(compareVolumeLabels("7.5", "EX") < 0);
    assert.deepEqual(
      normalizeVolumeLog([
        { label: "EX", completed_at: "2026-03-03" },
        { label: "1.5", completed_at: "2026-02-02" },
        { label: "1", completed_at: "2026-01-01" },
      ]).map((entry) => entry.label),
      ["1", "1.5", "EX"],
    );
  });

  it("expands completed novel volumes into timeline entries and ignores unfinished volumes", () => {
    const item = {
      title: "Example novel",
      originalTitle: "",
      mediaType: "novel",
      format: "light_novel",
      status: "ongoing",
      releaseStatus: "releasing",
      progress: 2,
      total: 4,
      unit: "volume",
      score: 8,
      favorite: false,
      year: 2026,
      genres: [],
      people: [],
      platforms: [],
      sourceUrls: [],
      cover: "series.jpg",
      filePath: "AnimeList/Novel/example.md",
      updated: 0,
      updatedLabel: "",
      startedAt: "",
      completedAt: "",
      volumeLog: normalizeVolumeLog([
        { label: "1", completed_at: "2026-01-02" },
        { label: "1.5", started_at: "2026-02-01" },
        { label: "EX", completed_at: "2026-03-04" },
      ]),
    } as const;
    const entries = expandTimelineEntries([item]);
    assert.deepEqual(entries.map((entry) => entry.title), [
      uiText("timeline.novelEventTitle", { title: "Example novel", volume: "1" }),
      uiText("timeline.novelEventTitle", { title: "Example novel", volume: "EX" }),
    ]);
    assert.equal(entries[0].cover, "series.jpg");
    assert.equal(entries[1].cover, "series.jpg");
    assert.equal(entries[0].volumeLabel, "1");
  });

  it("never infers manga or novel completion from a total", () => {
    assert.equal(completedProgress("completed", 42, 17, "manga"), 17);
    assert.equal(completedProgress("completed", 10, "7.5", "novel"), 7.5);
    assert.equal(completedProgress("completed", 12, 3, "anime"), 12);
    assert.equal(progressRatio(6, 12, "episode"), 0.5);
  });

  it("preserves optional cover metadata and unrelated serial-entry fields", () => {
    const entries = normalizeVolumeLog([{
      label: "1",
      started_at: "2026-01-01",
      completed_at: "2026-01-02",
      cover: "volume-1.jpg",
      cover_provider: "Google Books",
      cover_source_id: "book-1",
      isbn: "9780000000000",
    }]);
    assert.deepEqual(entries, [{
      label: "1",
      startedAt: "2026-01-01",
      completedAt: "2026-01-02",
      cover: "volume-1.jpg",
      coverProvider: "Google Books",
      coverSourceId: "book-1",
      extra: { isbn: "9780000000000" },
    }]);
    assert.deepEqual(serializeVolumeLog(entries), [{
      isbn: "9780000000000",
      label: "1",
      started_at: "2026-01-01",
      completed_at: "2026-01-02",
      cover: "volume-1.jpg",
      cover_provider: "Google Books",
      cover_source_id: "book-1",
    }]);
  });

  it("writes optional dates, release status, and per-volume history to schema version 6", () => {
    const novelResult = {
      ...baseResult,
      mediaType: "novel",
      format: "light_novel",
      unit: "volume",
      total: 0,
      releaseStatus: "releasing",
    };
    const markdown = buildMediaMarkdown(novelResult, {
      title: "Example novel",
      score: 9,
      status: "ongoing",
      releaseStatus: "releasing",
      startedAt: "",
      completedAt: "",
      progress: "1.5",
      total: 4,
      unit: "volume",
      favorite: false,
      genres: [],
      templatePath: "",
      volumeLog: normalizeVolumeLog([
        { label: "1", completed_at: "2026-01-02" },
        { label: "1.5", started_at: "2026-02-03" },
        { label: "EX", completed_at: "2026-04-05" },
      ]),
    }, "", "");
    assert.match(markdown, /schema_version: 6/);
    assert.match(markdown, /status: "ongoing"/);
    assert.match(markdown, /release_status: "releasing"/);
    assert.match(markdown, /progress: 1\.5/);
    assert.doesNotMatch(markdown, /^progress_total:/m);
    assert.match(markdown, /volume_log:[\s\S]*label: "1"[\s\S]*completed_at: "2026-01-02"[\s\S]*label: "1\.5"[\s\S]*label: "EX"/);
    assert.doesNotMatch(markdown, /^completed_at:/m);
  });

  it("prefers the serial-entry cover and falls back to the series cover", () => {
    const volumeLog = normalizeVolumeLog([{
      label: "14",
      completed_at: "2026-07-20",
      cover: "volume-14.jpg",
    }, {
      label: "15",
      completed_at: "2026-07-21",
    }]);
    const entries = expandTimelineEntries([{
      title: "藥屋少女的呢喃",
      originalTitle: "薬屋のひとりごと",
      mediaType: "novel",
      format: "light_novel",
      status: "ongoing",
      releaseStatus: "releasing",
      progress: 14,
      total: 0,
      unit: "volume",
      score: null,
      favorite: false,
      year: 2026,
      genres: [],
      people: [],
      platforms: [],
      sourceUrls: [],
      cover: "series.jpg",
      filePath: "AnimeList/Novel/kusuriya.md",
      updated: 0,
      updatedLabel: "",
      startedAt: "",
      completedAt: "",
      volumeLog,
    }]);
    assert.equal(
      entries[0].title,
      uiText("timeline.novelEventTitle", { title: "藥屋少女的呢喃", volume: "14" }),
    );
    assert.equal(entries[0].seriesTitle, "藥屋少女的呢喃");
    assert.equal(entries[0].volumeLabel, "14");
    assert.equal(entries[0].cover, "volume-14.jpg");
    assert.equal(entries[1].cover, "series.jpg");
  });


  it("assigns nearby timeline entries to separate vertical lanes", () => {
    const layout = assignTimelineLanes([
      { id: "a", x: 0 },
      { id: "b", x: 70 },
      { id: "c", x: 140 },
      { id: "d", x: 140 },
    ], 136);
    assert.deepEqual(layout.map((entry) => entry.lane), [0, 1, 0, 2]);
  });

  it("sorts same-day related titles and volume labels in natural order", () => {
    const entries = [
      { title: "Series 10" },
      { title: "Other work" },
      { title: "Series 2" },
      { title: "Series 1" },
    ].sort(compareTimelineEntries);
    assert.deepEqual(entries.map((entry) => entry.title), ["Other work", "Series 1", "Series 2", "Series 10"]);

    const volumes = [
      { title: "Novel — 第 10 卷", seriesTitle: "Novel", volumeLabel: "10" },
      { title: "Novel — 第 2 卷", seriesTitle: "Novel", volumeLabel: "2" },
      { title: "Novel — 第 1 卷", seriesTitle: "Novel", volumeLabel: "1" },
      { title: "Novel — 第 EX 卷", seriesTitle: "Novel", volumeLabel: "EX" },
    ].sort(compareTimelineEntries);
    assert.deepEqual(volumes.map((entry) => entry.volumeLabel), ["1", "2", "10", "EX"]);
  });

  it("omits an unknown serial total instead of writing a fake zero", () => {
    const markdown = buildMediaMarkdown({
      ...baseResult,
      mediaType: "manga",
      format: "manga",
      unit: "chapter",
      total: 0,
      releaseStatus: "releasing",
    }, {
      title: "Ongoing manga",
      score: 8,
      status: "ongoing",
      releaseStatus: "releasing",
      startedAt: "",
      completedAt: "",
      progress: 37,
      total: 0,
      unit: "chapter",
      favorite: false,
      genres: [],
      templatePath: "",
      volumeLog: [],
    }, "", "");
    assert.match(markdown, /progress: 37/);
    assert.doesNotMatch(markdown, /^progress_total:/m);
  });
});


describe("serial-entry cover UI", () => {
  it("keeps cover logic outside legacy and places the thumbnail on the row right side", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const featureSource = readFileSync(path.join(process.cwd(), "src/serial-cover-feature.ts"), "utf8");
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.serial-cover.css"), "utf8");

    assert.doesNotMatch(legacySource, /searchSerialCovers|SerialCover/);
    assert.match(featureSource, /serialCoverQuery\(context\.originalTitle, label\)/);
    assert.match(stylesheet, /\.animelist-modal \.al-volume-row \{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto;/);
    assert.match(stylesheet, /\.al-serial-cover-panel/);
  });

  it("stores the user-provided Google Books key in plugin settings, not frontmatter", () => {
    assert.equal(PathExists(path.join(process.cwd(), "src/serial-cover-provider.ts")), true);
    assert.equal(DEFAULT_SETTINGS.googleBooksApiKey, "");
    const featureSource = readFileSync(path.join(process.cwd(), "src/serial-cover-feature.ts"), "utf8");
    assert.doesNotMatch(featureSource, /frontmatter\.googleBooksApiKey|google_books_api_key/);
  });
});

describe("modal scrolling", () => {
  it("uses the outer Obsidian modal as the only vertical scroll container", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
    assert.match(stylesheet, /\.al-search-results \{[^}]*max-height:none[^}]*overflow:visible/);
    assert.doesNotMatch(stylesheet, /\.al-search-results \{[^}]*overflow:auto/);
  });
});

describe("compact library rendering", () => {
  it("keeps compact rows at cover height and bounds eager cover loading", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");

    assert.match(legacySource, /image\.loading = "lazy"/);
    assert.match(legacySource, /const eagerCoverCount = \(view\) => view === "poster" \? 10 : view === "list" \? 4 : 6/);
    assert.match(legacySource, /image\.loading = index < eagerCount \? "eager" : "lazy"/);
    assert.match(legacySource, /image\.fetchPriority = index < 2 \? "high" : "auto"/);
    assert.match(legacySource, /image\.sizes = coverSizes\(state\.view\)/);
    assert.match(legacySource, /image\.decoding = "async"/);
    assert.match(stylesheet, /\.al-grid\.is-poster \.al-card \{[^}]*height: 138px[^}]*max-height: 138px/s);
    assert.match(stylesheet, /\.al-grid\.is-poster \.al-card-body \{[^}]*max-height: 138px[^}]*overflow: hidden/s);
    assert.match(stylesheet, /\.al-grid\.is-poster \.al-original-title \{[^}]*text-overflow:ellipsis/);
    assert.match(stylesheet, /\.al-grid\.is-poster \.al-facts span,[\s\S]*text-overflow:ellipsis/);
  });
});

describe("timeline connector geometry", () => {
  it("connects every card lane back to the main axis behind cards", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");

    assert.match(legacySource, /const stemStart = aboveAxis \? cardY \+ CARD_HEIGHT : axisY/);
    assert.match(legacySource, /const stemEnd = aboveAxis \? axisY : cardY/);
    assert.match(legacySource, /stem\.style\.height = `\$\{Math\.max\(1, stemEnd - stemStart\)\}px`/);
    assert.match(stylesheet, /\.al-timeline-stem \{[^}]*z-index:0[^}]*pointer-events:none/);
    assert.match(stylesheet, /\.al-timeline-card \{[^}]*z-index:3/);
  });
});

describe("timeline media filters", () => {
  it("filters expanded timeline entries without collapsing novel volumes", () => {
    const entries = [
      { mediaType: "anime", title: "Anime" },
      { mediaType: "manga", title: "Manga" },
      { mediaType: "novel", title: "Novel volume 1", volumeLabel: "1" },
      { mediaType: "novel", title: "Novel volume 2", volumeLabel: "2" },
    ];

    assert.deepEqual(filterTimelineEntries(entries, "all"), entries);
    assert.deepEqual(filterTimelineEntries(entries, "anime").map((entry) => entry.title), ["Anime"]);
    assert.deepEqual(filterTimelineEntries(entries, "manga").map((entry) => entry.title), ["Manga"]);
    assert.deepEqual(
      filterTimelineEntries(entries, "novel").map((entry) => entry.volumeLabel),
      ["1", "2"],
    );
  });

  it("renders the approved all, anime, manga, and novel filter buttons", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");

    assert.ok(UI_TEXT["timeline.filterAll"].trim());
    assert.equal(uiText("timeline.filterAll"), UI_TEXT["timeline.filterAll"]);
    assert.match(legacySource, /\["all", uiText\("timeline\.filterAll"\)\]/);
    assert.match(legacySource, /\["anime", uiText\("media\.type\.anime"\)\]/);
    assert.match(legacySource, /\["manga", uiText\("media\.type\.manga"\)\]/);
    assert.match(legacySource, /\["novel", uiText\("media\.type\.novel"\)\]/);
    assert.match(legacySource, /render\(container, inputItems, \{ \.\.\.adapters, typeFilter: type \}\)/);
    assert.match(stylesheet, /\.al-timeline-type-filter\.is-active/);
  });

  it("keeps date spacing and overall scene scale as independent state", () => {
    const defaultView = calculateDefaultTimelineView([0, 24 * 60 * 60 * 1000], 1, 3);

    assert.equal(defaultView.viewScale, 1);
    assert.equal(MIN_TIMELINE_VIEW_SCALE, 0.1);
    assert.ok(defaultView.daySpacing > defaultView.viewScale);
  });
});

describe("tracked UI wording", () => {
  it("routes shared action and section labels through UI_TEXT", () => {
    const keys = [
      "action.save",
      "action.add",
      "action.remove",
      "action.delete",
      "action.cancel",
      "action.edit",
      "action.search",
      "action.back",
      "action.collect",
      "library.title",
      "library.emptyTitle",
      "volume.title",
      "volume.add",
      "volume.label",
      "volume.startedAt",
      "volume.completedAt",
      "timeline.title",
      "timeline.fit",
      "timeline.emptyTitle",
    ] as const;

    for (const key of keys) {
      assert.ok(UI_TEXT[key].trim(), `${key} must not be empty`);
      assert.equal(uiText(key), UI_TEXT[key]);
    }

    const renderedVolume = uiText("timeline.volumeLabel", { volume: "EX" });
    assert.ok(renderedVolume.includes("EX"));
  });

  it("uses the approved shared status labels without a paused option", () => {
    const expected = [
      UI_TEXT["media.status.all"],
      UI_TEXT["media.status.ongoing"],
      UI_TEXT["media.status.completed"],
      UI_TEXT["media.status.planned"],
      UI_TEXT["media.status.dropped"],
    ];
    assert.deepEqual(statusFilterOptions("anime").map(([, label]) => label), expected);
    assert.deepEqual(statusFilterOptions("novel").map(([, label]) => label), expected);
    assert.deepEqual(statusFilterOptions("all").map(([, label]) => label), expected);
    assert.equal(Object.values(UI_TEXT).some((label) => label.includes("/") || label.includes("／")), false);
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    assert.doesNotMatch(legacySource, /plannedAnime|plannedReading|pausedAnime|pausedReading|droppedAnime|droppedReading/);
    assert.doesNotMatch(legacySource, /\["on_hold"|\["watching"|\["reading"/);
  });


  it("keeps user-visible wording in one tracked source file", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    const templateSource = readFileSync(path.join(process.cwd(), "src/builtin-templates.ts"), "utf8");
    const settingsSource = readFileSync(path.join(process.cwd(), "src/settings.ts"), "utf8");
    const runtimeSources = [legacySource, mainSource, templateSource, settingsSource];

    for (const source of runtimeSources) {
      assert.doesNotMatch(source, /new Notice\(\s*["'`][^\n)]*[\u3400-\u9fff]/);
      assert.doesNotMatch(source, /throw new Error\(\s*["'`][^\n)]*[\u3400-\u9fff]/);
      assert.doesNotMatch(source, /\.textContent\s*=\s*["'`][^\n;]*[\u3400-\u9fff]/);
      assert.doesNotMatch(source, /\.placeholder\s*=\s*["'`][^\n;]*[\u3400-\u9fff]/);
    }


    assert.doesNotMatch(legacySource, /TV 動畫|動畫電影|手動建立|簡潔筆記（內建）/);
    assert.doesNotMatch(mainSource, /Create library folders|已收進最愛|已從最愛中移除/);
    assert.match(templateSource, /uiText\("template\.builtinPlain"\)/);
    assert.doesNotMatch(settingsSource, /\.setName\(["'`]|\.setDesc\(["'`]|\.setButtonText\(["'`]/);
    assert.equal(mediaFormatLabel("light_novel"), UI_TEXT["media.format.lightNovel"]);
    assert.equal(mediaProviderLabel("bangumi"), UI_TEXT["media.provider.bangumi"]);
  });

  it("does not ship runtime wording overrides", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    assert.equal(PathExists(path.join(process.cwd(), "ui-text.example.json")), false);
    assert.equal(PathExists(path.join(process.cwd(), "docs/UI_TEXT_OVERRIDES.md")), false);
    assert.doesNotMatch(mainSource, /reload-ui-text|create-ui-text-file|ui-text\.local\.json/);
  });
});

describe("repository hygiene", () => {
  it("keeps test vault data local while tracking reproducible tooling", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const scripts = packageJson.scripts ?? {};
    const gitignore = readFileSync(path.join(process.cwd(), ".gitignore"), "utf8");
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    const contributing = readFileSync(path.join(process.cwd(), "CONTRIBUTING.md"), "utf8");
    const testVaultSource = readFileSync(
      path.join(process.cwd(), "scripts/test-vault.mjs"),
      "utf8",
    );

    // Generated vault contents and Obsidian state must remain local-only.
    assert.match(gitignore, /^\/test-vault\/$/m);

    // Reproducible tooling is tracked; the retired repository symlink helper
    // and its package command must not return.
    assert.equal(PathExists(path.join(process.cwd(), "scripts/test-vault.mjs")), true);
    assert.equal(PathExists(path.join(process.cwd(), "scripts/link-test-vault.mjs")), false);
    assert.equal("test-vault:link" in scripts, false);

    // package.json exposes stable development and release-equivalent commands.
    assert.equal(
      scripts["test-vault"],
      "npm run check && npm run release:check && node scripts/test-vault.mjs production",
    );
    assert.equal(
      scripts["test-vault:dev"],
      "node scripts/test-vault.mjs development",
    );

    // Production testing installs exactly the three public release artifacts.
    assert.match(
      testVaultSource,
      /const RELEASE_FILES = \["main\.js", "manifest\.json", "styles\.css"\]/,
    );
    assert.match(testVaultSource, /ANIMELIST_TEST_VAULT/);
    assert.doesNotMatch(testVaultSource, /symlinkSync\(repoRoot/);

    // Contributor documentation explains the local workflow while the public
    // README remains focused on installation and use.
    assert.doesNotMatch(readme, /test[-_ ]vault/i);
    assert.match(contributing, /npm run test-vault\b/);
    assert.match(contributing, /npm run test-vault:dev\b/);
  });
});

describe("repository defaults", () => {
  it("uses a managed AnimeList folder by default", () => {
    assert.equal(DEFAULT_SETTINGS.storageMode, "managed");
    assert.equal(DEFAULT_SETTINGS.libraryRoot, "AnimeList");
    assert.equal(DEFAULT_SETTINGS.uiState.sort, "completed-desc");
  });

  it("offers built-in and custom-compatible templates", () => {
    const animeTemplates = getBuiltInTemplateOptions("anime");
    assert.deepEqual(animeTemplates, [
      { path: "builtin:plain", name: UI_TEXT["template.builtinPlain"] },
    ]);
  });

  it("supports managed and flat media paths", () => {
    const plugin = Object.create(AnimeListPlugin.prototype) as AnimeListPlugin;
    plugin.settings = structuredClone(DEFAULT_SETTINGS);
    assert.equal(plugin.getMediaFolder("anime"), "AnimeList/Anime");
    plugin.settings.storageMode = "flat";
    plugin.settings.flatMediaFolder = "Library";
    assert.equal(plugin.getMediaFolder("manga"), "Library");
  });


  it("exposes declarative settings while preserving storage-mode visibility", () => {
    const host = {
      settings: structuredClone(DEFAULT_SETTINGS),
      async saveSettings(): Promise<void> {},
      async initializeLibrary(): Promise<void> {},
      refreshViews(): void {},
    };
    const tab = new AnimeListSettingTab(new App(), host);
    const definitions = tab.getSettingDefinitions();
    assert.equal(definitions.length, 12);
    assert.deepEqual(
      definitions.map((definition) => definition.name),
      [
        UI_TEXT["settings.storageLayout.name"],
        UI_TEXT["settings.libraryRoot.name"],
        UI_TEXT["settings.flatFolder.name"],
        UI_TEXT["settings.additionalFolders.name"],
        UI_TEXT["settings.coverFolder.name"],
        UI_TEXT["settings.templateFolder.name"],
        UI_TEXT["settings.timelineMaxStackDepth.name"],
        UI_TEXT["media.provider.bangumi"],
        UI_TEXT["media.provider.anilist"],
        UI_TEXT["media.provider.openlibrary"],
        UI_TEXT["settings.createFolders.name"],
        UI_TEXT["settings.copyTemplates.name"],
      ],
    );

    const libraryRoot = definitions.find((definition) => definition.name === UI_TEXT["settings.libraryRoot.name"]);
    const flatFolder = definitions.find((definition) => definition.name === UI_TEXT["settings.flatFolder.name"]);
    assert.equal(libraryRoot?.visible?.(), true);
    assert.equal(flatFolder?.visible?.(), false);

    host.settings.storageMode = "flat";
    assert.equal(libraryRoot?.visible?.(), false);
    assert.equal(flatFolder?.visible?.(), true);
  });
});


describe("version documentation", () => {
  it("keeps release notes current and the README focused", () => {
    const sessions = readFileSync(path.join(process.cwd(), "docs/VERSION_SESSIONS.md"), "utf8");
    const changelog = readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    const roadmap = readFileSync(path.join(process.cwd(), "ROADMAP.md"), "utf8");
    const userGuide = readFileSync(path.join(process.cwd(), "docs/USER_GUIDE.md"), "utf8");

    assert.match(sessions, /## 1\.0\.x — Public foundation/);
    assert.match(sessions, /## 1\.1\.0 — Serial reading and novel-volume timeline/);
    assert.match(sessions, /\*\*Release state:\*\* Published through `1\.1\.2`\./);
    assert.match(changelog, /## 1\.2\.0 - 2026-07-26/);
    assert.match(changelog, /## 1\.1\.2 - 2026-07-22/);
    assert.match(readme, /> \[!NOTE\]/);
    assert.match(readme, /> \*\*What's new in 1\.2\.0\*\*/);
    assert.match(readme, /\[User Guide\]\(docs\/USER_GUIDE\.md\)/);
    assert.match(userGuide, /## Score Dashboard/);
    assert.match(userGuide, /## Markdown data and templates/);
    assert.doesNotMatch(roadmap, /Add a score dashboard/);
    assert.doesNotMatch(readme, /## Library data/);
  });

  it("keeps every runtime and release version synchronized", () => {
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "manifest.json"), "utf8")) as { version: string };
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string };
    const packageLock = JSON.parse(readFileSync(path.join(process.cwd(), "package-lock.json"), "utf8")) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    const versions = JSON.parse(readFileSync(path.join(process.cwd(), "versions.json"), "utf8")) as Record<string, string>;
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");

    assert.equal(manifest.version, "1.2.0");
    assert.equal(packageJson.version, manifest.version);
    assert.equal(packageLock.version, manifest.version);
    assert.equal(packageLock.packages[""]?.version, manifest.version);
    assert.equal(versions[manifest.version], "1.5.0");
    assert.match(mainSource, /const PLUGIN_VERSION = "1\.2\.0";/);
    assert.match(legacySource, /const PLUGIN_VERSION = "1\.2\.0";/);
  });
});

describe("timeline modal and Traditional Chinese labels", () => {
  it("opens the timeline through an Obsidian modal instead of replacing the library view", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    assert.match(mainSource, /new TimelineModal\(this, this\.collectMediaItems\(\)\)\.open\(\)/);
    assert.doesNotMatch(mainSource, /showSection\("timeline"\)/);
  });

  it("shows novel volume labels through the tracked timeline classes", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
    assert.match(legacySource, /al-timeline-volume-label/);
    assert.match(legacySource, /aboveAxis = lane % 2 === 0/);
    assert.match(stylesheet, /\.al-timeline-volume-label/);
  });

  it("reuses the same UI_TEXT keys for the same operation", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    assert.match(legacySource, /save\.textContent = uiText\("action\.save"\)/);
    assert.match(legacySource, /createButton\.textContent = uiText\("action\.collect"\)/);
    assert.match(legacySource, /appendIconLabel\(addButton, "plus", uiText\("action\.collect"\)\)/);
    assert.match(mainSource, /id: "add-media", name: uiText\("action\.collect"\)/);
    assert.ok((legacySource.match(/uiText\("action\.delete"\)/g) || []).length >= 3);
    assert.ok((legacySource.match(/uiText\("action\.edit"\)/g) || []).length >= 2);
    assert.match(legacySource, /button\.textContent = uiText\("action\.search"\)/);
    assert.match(legacySource, /back\.textContent = uiText\("action\.back"\)/);
    assert.doesNotMatch(legacySource, /保存這次整理|移除這卷|保存失敗|建立作品筆記|搜尋並收錄作品|整理這筆紀錄|移除作品/);
  });

  it("uses tracked status and timeline labels without restoring removed total fields", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    assert.ok(UI_TEXT["media.status.ongoing"].trim());
    assert.ok(UI_TEXT["media.status.planned"].trim());
    assert.ok(UI_TEXT["library.timeline"].trim());
    assert.match(legacySource, /appendIconLabel\(timelineButton, "timeline", uiText\("library\.timeline"\)\)/);
    assert.doesNotMatch(legacySource, /日本原版最新話數|日本原版最新卷數|已追到最新/);
  });
});


describe("Obsidian community review compliance", () => {
  it("does not assign HTML strings directly", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    assert.doesNotMatch(legacySource, /\.innerHTML\s*=/);
    assert.match(legacySource, /setIcon\(/);
  });

  it("preserves custom view placement during plugin unload", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    assert.doesNotMatch(mainSource, /detachLeavesOfType/);
  });

  it("uses native setting headings", () => {
    const settingsSource = readFileSync(path.join(process.cwd(), "src/settings.ts"), "utf8");
    assert.doesNotMatch(settingsSource, /createEl\("h[23]"/);

    const host = {
      app: new App(),
      settings: structuredClone(DEFAULT_SETTINGS),
      async loadData(): Promise<unknown> { return {}; },
      async saveSettings(): Promise<void> {},
      async initializeLibrary(): Promise<void> {},
      refreshViews(): void {},
    };
    const sections = new AnimeListSettingTab(new App(), host).getSettingSections();
    assert.deepEqual(
      sections.map((section) => section.heading ?? ""),
      ["", UI_TEXT["settings.timeline.heading"], "Search languages", UI_TEXT["settings.providers.heading"], UI_TEXT["settings.setup.heading"]],
    );
  });

  it("attests release assets", () => {
    const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/release.yml"), "utf8");
    assert.match(workflow, /actions\/attest@v4/);
    assert.match(workflow, /attestations: write/);
    assert.match(workflow, /artifact-metadata: write/);
    assert.match(workflow, /subject-path:[\s\S]*main\.js[\s\S]*manifest\.json[\s\S]*styles\.css/);
  });
});


describe("Community review preflight", () => {
  it("contains no blocking DOM, lifecycle, or settings-heading patterns", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    const settingsSource = readFileSync(path.join(process.cwd(), "src/settings.ts"), "utf8");
    assert.doesNotMatch(legacySource, /\.innerHTML\s*=/);
    assert.doesNotMatch(mainSource, /detachLeavesOfType\s*\(/);
    assert.doesNotMatch(settingsSource, /setName\(["']AnimeList["']\)\.setHeading\(\)/);
  });

  it("uses paired, allowed compatibility lint scopes without forbidden suppressions", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    const settingsSource = readFileSync(path.join(process.cwd(), "src/settings.ts"), "utf8");
    const shimSource = readFileSync(path.join(process.cwd(), "types/obsidian.d.ts"), "utf8");
    const cssSource = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
    assert.match(legacySource, /eslint-disable[^\n]*@typescript-eslint\/no-unsafe-return/);
    assert.match(legacySource, /eslint-enable[^\n]*@typescript-eslint\/no-unsafe-return/);
    assert.match(mainSource, /eslint-disable[^\n]*@typescript-eslint\/no-unsafe-member-access/);
    assert.match(mainSource, /eslint-enable[^\n]*@typescript-eslint\/no-unsafe-member-access/);
    assert.doesNotMatch(legacySource, /eslint-disable[^\n]*obsidianmd\/prefer-create-el/);
    assert.doesNotMatch(mainSource, /eslint-disable[^\n]*@typescript-eslint\/no-explicit-any/);
    assert.doesNotMatch(settingsSource, /eslint-disable/);
    assert.doesNotMatch(shimSource, /eslint-disable|\bany\b/);
    assert.doesNotMatch(cssSource, /!important|stylelint-disable/);
  });

  it("uses Obsidian DOM helpers and declarative settings definitions", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const settingsSource = readFileSync(path.join(process.cwd(), "src/settings.ts"), "utf8");
    assert.doesNotMatch(legacySource, /document\.create(?:Element|DocumentFragment|TextNode)/);
    assert.match(legacySource, /const node = createEl\(tag\)/);
    assert.match(settingsSource, /getSettingDefinitions\(\): SettingDefinition\[\]/);
  });
});


describe("scoped vault access", () => {
  it("walks only configured folders and returns Markdown files once", () => {
    const library = new TFolder();
    library.path = "AnimeList";
    const animeFolder = new TFolder();
    animeFolder.path = "AnimeList/Anime";
    const note = new TFile();
    note.path = "AnimeList/Anime/Example.md";
    note.extension = "md";
    const ignored = new TFile();
    ignored.path = "AnimeList/Anime/cover.jpg";
    ignored.extension = "jpg";
    animeFolder.children = [note, ignored];
    library.children = [animeFolder];

    const root = new TFolder();
    root.path = "";
    const rootNote = new TFile();
    rootNote.path = "Root note.md";
    rootNote.extension = "md";
    root.children = [rootNote, library];

    const app = {
      vault: {
        getRoot() { return root; },
        getAbstractFileByPath(path: string) {
          return path === "AnimeList" ? library : null;
        },
      },
    } as never;

    assert.deepEqual(
      getScopedMarkdownFiles(app, ["AnimeList", "AnimeList"]).map((file) => file.path),
      ["AnimeList/Anime/Example.md"],
    );
    assert.deepEqual(
      getScopedMarkdownFiles(app, [""]).map((file) => file.path),
      ["Root note.md"],
    );
  });
});
