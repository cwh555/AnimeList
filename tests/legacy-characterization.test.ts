import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { App, TFile, TFolder } from "obsidian";
import AnimeListPlugin from "../src/main";
import { PLUGIN_VERSION } from "../src/app-metadata";
import { BUILTIN_TEMPLATES, getBuiltInTemplateOptions } from "../src/builtin-templates";
import { AnimeListSettingTab, DEFAULT_SETTINGS } from "../src/settings";
import { legacyTest } from "../src/legacy";
import { SEGMENTED_DATE_PARTS } from "../src/segmented-date-input";
import { libraryCoverSizes, libraryEagerCoverCount } from "../src/ui/library-renderer";
import { TIMELINE_MEDIA_FILTERS, timelineStemGeometry } from "../src/ui/timeline-renderer";
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




});

describe("segmented date input", () => {
  it("normalizes only complete real calendar dates", () => {
    assert.equal(normalizeDateParts("2026", "07", "21"), "2026-07-21");
    assert.equal(normalizeDateParts("2026", "02", "29"), "");
    assert.equal(normalizeDateParts("2024", "02", "29"), "2024-02-29");
    assert.equal(normalizeDateParts("2026", "7", "21"), "");
  });

  it("uses the released year, month, and day segment policy", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
    assert.deepEqual(SEGMENTED_DATE_PARTS, {
      year: { length: 4, placeholder: "YYYY" },
      month: { length: 2, placeholder: "MM" },
      day: { length: 2, placeholder: "DD" },
    });
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
  it("places the thumbnail panel on the row right side", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.serial-cover.css"), "utf8");
    assert.match(stylesheet, /\.animelist-modal \.al-volume-row \{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto;/);
    assert.match(stylesheet, /\.al-serial-cover-panel/);
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
  it("keeps released cover loading policies and compact poster styles", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
    assert.equal(libraryEagerCoverCount("poster"), 10);
    assert.equal(libraryEagerCoverCount("list"), 4);
    assert.equal(libraryEagerCoverCount("grid"), 6);
    assert.equal(libraryCoverSizes("list"), "116px");
    assert.equal(libraryCoverSizes("poster"), "(max-width: 440px) 50vw, 180px");
    assert.match(libraryCoverSizes("grid"), /240px$/);
    assert.match(stylesheet, /\.al-grid\.is-poster \.al-card \{[^}]*height: 138px[^}]*max-height: 138px/s);
    assert.match(stylesheet, /\.al-grid\.is-poster \.al-card-body \{[^}]*max-height: 138px[^}]*overflow: hidden/s);
    assert.match(stylesheet, /\.al-grid\.is-poster \.al-original-title \{[^}]*text-overflow:ellipsis/);
  });
});

describe("timeline connector geometry", () => {
  it("connects every card lane back to the main axis behind cards", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
    assert.deepEqual(timelineStemGeometry(true, 100, 300, 146), { start: 246, end: 300, height: 54 });
    assert.deepEqual(timelineStemGeometry(false, 400, 300, 146), { start: 300, end: 400, height: 100 });
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
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
    assert.deepEqual(TIMELINE_MEDIA_FILTERS, ["all", "anime", "manga", "novel"]);
    assert.equal(uiText("timeline.filterAll"), UI_TEXT["timeline.filterAll"]);
    assert.ok(uiText("media.type.anime").trim());
    assert.ok(uiText("media.type.manga").trim());
    assert.ok(uiText("media.type.novel").trim());
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
  });


  it("keeps shared format, provider, and template wording in the tracked catalog", () => {
    assert.equal(mediaFormatLabel("light_novel"), UI_TEXT["media.format.lightNovel"]);
    assert.equal(mediaProviderLabel("bangumi"), UI_TEXT["media.provider.bangumi"]);
    assert.equal(getBuiltInTemplateOptions("anime")[0]?.name, UI_TEXT["template.builtinPlain"]);
  });

  it("does not ship runtime wording override artifacts", () => {
    assert.equal(PathExists(path.join(process.cwd(), "ui-text.example.json")), false);
    assert.equal(PathExists(path.join(process.cwd(), "docs/UI_TEXT_OVERRIDES.md")), false);
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
    assert.match(changelog, /## 1\.2\.1 - 2026-07-27/);
    assert.match(changelog, /## 1\.2\.0 - 2026-07-26/);
    assert.match(changelog, /## 1\.1\.2 - 2026-07-22/);
    assert.match(readme, /> \[!NOTE\]/);
    assert.match(readme, /> \*\*What's new in 1\.2\.1\*\*/);
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
    assert.equal(manifest.version, "1.2.1");
    assert.equal(packageJson.version, manifest.version);
    assert.equal(packageLock.version, manifest.version);
    assert.equal(packageLock.packages[""]?.version, manifest.version);
    assert.equal(versions[manifest.version], "1.5.0");
    assert.equal(PLUGIN_VERSION, manifest.version);
  });
});

describe("timeline modal and Traditional Chinese labels", () => {
  it("preserves serial-entry labels and tracked timeline styling", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
    const entries = expandTimelineEntries([{
      mediaType: "novel",
      title: "Series",
      filePath: "Media/Novel/Series.md",
      completedAt: "",
      volumeLog: [{ label: "2", completedAt: "2026-01-02" }],
      unit: "volume",
    }]);
    assert.equal(entries[0]?.serialEntryLabel, "第 2 卷");
    assert.match(stylesheet, /\.al-timeline-volume-label/);
  });

  it("uses tracked action, status, and timeline labels", () => {
    for (const key of [
      "action.save", "action.collect", "action.delete", "action.edit", "action.search", "action.back",
      "media.status.ongoing", "media.status.planned", "library.timeline",
    ] as const) assert.ok(UI_TEXT[key].trim());
    const catalog = Object.values(UI_TEXT).join("\n");
    assert.doesNotMatch(catalog, /保存這次整理|移除這卷|保存失敗|建立作品筆記|搜尋並收錄作品|整理這筆紀錄|日本原版最新話數|日本原版最新卷數|已追到最新/);
  });
});

describe("Obsidian community review compliance", () => {
  it("exposes settings as native section definitions", () => {
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
