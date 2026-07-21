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

const PathExists = existsSync;

const {
  assignTimelineLanes,
  buildMediaMarkdown,
  completedProgress,
  filterTimelineEntries,
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
    }, "", ""), /必須填寫個人評分/);
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
      status: "reading",
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
    assert.deepEqual(entries.map((entry) => entry.title), ["Example novel — 第 1 卷", "Example novel — 第 EX 卷"]);
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

  it("stores only volume labels and reading dates", () => {
    const entries = normalizeVolumeLog([{
      label: "1",
      started_at: "2026-01-01",
      completed_at: "2026-01-02",
      cover: "unpublished-test-value.jpg",
      isbn: "9780000000000",
    }]);
    assert.deepEqual(entries, [{
      label: "1",
      startedAt: "2026-01-01",
      completedAt: "2026-01-02",
    }]);
    assert.deepEqual(serializeVolumeLog(entries), [{
      label: "1",
      started_at: "2026-01-01",
      completed_at: "2026-01-02",
    }]);
  });

  it("writes optional dates, release status, and per-volume history to schema version 5", () => {
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
      status: "reading",
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
    assert.match(markdown, /schema_version: 5/);
    assert.match(markdown, /release_status: "releasing"/);
    assert.match(markdown, /progress: 1\.5/);
    assert.doesNotMatch(markdown, /^progress_total:/m);
    assert.match(markdown, /volume_log:[\s\S]*label: "1"[\s\S]*completed_at: "2026-01-02"[\s\S]*label: "1\.5"[\s\S]*label: "EX"/);
    assert.doesNotMatch(markdown, /^completed_at:/m);
  });

  it("uses the series cover and includes the volume number in timeline text", () => {
    const volumeLog = normalizeVolumeLog([{
      label: "14",
      completed_at: "2026-07-20",
    }]);
    const entries = expandTimelineEntries([{
      title: "藥屋少女的呢喃",
      originalTitle: "薬屋のひとりごと",
      mediaType: "novel",
      format: "light_novel",
      status: "reading",
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
    assert.equal(entries[0].title, "藥屋少女的呢喃 — 第 14 卷");
    assert.equal(entries[0].seriesTitle, "藥屋少女的呢喃");
    assert.equal(entries[0].volumeLabel, "14");
    assert.equal(entries[0].cover, "series.jpg");
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
      status: "reading",
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


describe("novel volume editor UI", () => {
  it("keeps volume-number sorting and navigation without any volume-cover controls", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");

    assert.match(legacySource, /entries\.sort\(\(left, right\) => compareVolumeLabels/);
    assert.match(legacySource, /scrollIntoView\(\{ behavior: "smooth", block: "center", inline: "nearest" \}\)/);
    assert.match(legacySource, /labelInput\.focus\(\{ preventScroll: true \}\)/);
    assert.match(legacySource, /completedAt: todayString\(\)/);
    assert.match(legacySource, /entry\.completedAt \|\| todayString\(\)/);
    assert.doesNotMatch(legacySource, /搜尋封面候選|更換封面候選|searchNovelVolumeCovers|VolumeCoverSearchModal/);
    assert.doesNotMatch(stylesheet, /al-volume-cover|animelist-volume-cover-modal/);
  });

  it("does not ship a per-volume cover provider module or credentials", () => {
    assert.equal(PathExists(path.join(process.cwd(), "src/volume-covers.ts")), false);
    assert.equal("novelCovers" in DEFAULT_SETTINGS, false);
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

    assert.equal(UI_TEXT["timeline.filterAll"], "所有");
    assert.match(legacySource, /\["all", uiText\("timeline\.filterAll"\)\]/);
    assert.match(legacySource, /\["anime", uiText\("media\.type\.anime"\)\]/);
    assert.match(legacySource, /\["manga", uiText\("media\.type\.manga"\)\]/);
    assert.match(legacySource, /\["novel", uiText\("media\.type\.novel"\)\]/);
    assert.match(legacySource, /render\(container, inputItems, \{ \.\.\.adapters, typeFilter: type \}\)/);
    assert.match(stylesheet, /\.al-timeline-type-filter\.is-active/);
  });
});

describe("tracked UI wording", () => {
  it("uses the approved shared action and section labels", () => {
    assert.equal(UI_TEXT["action.save"], "儲存");
    assert.equal(UI_TEXT["action.add"], "新增");
    assert.equal(UI_TEXT["action.remove"], "移除");
    assert.equal(UI_TEXT["action.delete"], "刪除");
    assert.equal(UI_TEXT["action.cancel"], "取消");
    assert.equal(UI_TEXT["action.edit"], "編輯");
    assert.equal(UI_TEXT["action.search"], "搜尋");
    assert.equal(UI_TEXT["action.back"], "返回");
    assert.equal(UI_TEXT["action.collect"], "收錄");
    assert.equal(UI_TEXT["library.title"], "收藏庫");
    assert.equal(UI_TEXT["library.emptyTitle"], "沒有符合條件的項目");
    assert.equal(UI_TEXT["volume.title"], "分卷紀錄");
    assert.equal(UI_TEXT["volume.add"], "新增一卷");
    assert.equal(UI_TEXT["volume.label"], "卷數");
    assert.equal(UI_TEXT["volume.startedAt"], "開始日期");
    assert.equal(UI_TEXT["volume.completedAt"], "完成日期");
    assert.equal(UI_TEXT["timeline.title"], "時間軸");
    assert.equal(UI_TEXT["timeline.fit"], "完整顯示");
    assert.equal(UI_TEXT["timeline.emptyTitle"], "尚無完成紀錄");
    assert.equal(uiText("timeline.volumeLabel", { volume: "EX" }), "第 EX 卷");
  });

  it("uses the approved media-specific status labels", () => {
    assert.deepEqual(statusFilterOptions("anime").map(([, label]) => label), [
      UI_TEXT["media.status.all"],
      UI_TEXT["media.status.watching"],
      UI_TEXT["media.status.completedAnime"],
      UI_TEXT["media.status.plannedAnime"],
      UI_TEXT["media.status.pausedAnime"],
      UI_TEXT["media.status.droppedAnime"],
    ]);
    assert.deepEqual(statusFilterOptions("novel").map(([, label]) => label), [
      UI_TEXT["media.status.all"],
      UI_TEXT["media.status.reading"],
      UI_TEXT["media.status.completedReading"],
      UI_TEXT["media.status.plannedReading"],
      UI_TEXT["media.status.pausedReading"],
      UI_TEXT["media.status.droppedReading"],
    ]);
    assert.deepEqual(statusFilterOptions("all").map(([, label]) => label), [
      UI_TEXT["media.status.all"],
      UI_TEXT["media.status.active"],
      UI_TEXT["media.status.completed"],
      UI_TEXT["media.status.planned"],
      UI_TEXT["media.status.paused"],
      UI_TEXT["media.status.dropped"],
    ]);
    assert.equal(Object.values(UI_TEXT).some((label) => label.includes("/") || label.includes("／")), false);
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    assert.match(legacySource, /\["dropped", uiText\("media\.status\.droppedAnime"\)\]/);
    assert.match(legacySource, /\["dropped", uiText\("media\.status\.droppedReading"\)\]/);
    assert.doesNotMatch(legacySource, /value === "dropped" \? "on_hold"/);
  });



  it("keeps user-visible wording in one tracked source file", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    const templateSource = readFileSync(path.join(process.cwd(), "src/builtin-templates.ts"), "utf8");
    const novelSource = readFileSync(path.join(process.cwd(), "src/novel-progress.ts"), "utf8");
    const settingsSource = readFileSync(path.join(process.cwd(), "src/settings.ts"), "utf8");
    const runtimeSources = [legacySource, mainSource, templateSource, novelSource, settingsSource];

    for (const source of runtimeSources) {
      assert.doesNotMatch(source, /new Notice\(\s*["'`][^\n)]*[\u3400-\u9fff]/);
      assert.doesNotMatch(source, /throw new Error\(\s*["'`][^\n)]*[\u3400-\u9fff]/);
      assert.doesNotMatch(source, /\.textContent\s*=\s*["'`][^\n;]*[\u3400-\u9fff]/);
      assert.doesNotMatch(source, /\.placeholder\s*=\s*["'`][^\n;]*[\u3400-\u9fff]/);
    }


    assert.doesNotMatch(legacySource, /TV 動畫|動畫電影|手動建立|簡潔筆記（內建）/);
    assert.doesNotMatch(mainSource, /Create library folders|已收進最愛|已從最愛中移除/);
    assert.match(templateSource, /uiText\("template\.builtinPlain"\)/);
    assert.match(novelSource, /uiText\("timeline\.novelEventTitle"/);
    assert.doesNotMatch(settingsSource, /\.setName\(["'`]|\.setDesc\(["'`]|\.setButtonText\(["'`]/);
    assert.equal(mediaFormatLabel("light_novel"), "輕小說");
    assert.equal(mediaProviderLabel("bangumi"), "Bangumi");
  });

  it("does not ship runtime wording overrides", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    assert.equal(PathExists(path.join(process.cwd(), "ui-text.example.json")), false);
    assert.equal(PathExists(path.join(process.cwd(), "docs/UI_TEXT_OVERRIDES.md")), false);
    assert.doesNotMatch(mainSource, /reload-ui-text|create-ui-text-file|ui-text\.local\.json/);
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
      { path: "builtin:plain", name: "簡潔筆記（內建）" },
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
    assert.equal(definitions.length, 11);
    assert.deepEqual(
      definitions.map((definition) => definition.name),
      [
        "Storage layout",
        "Library root",
        "Flat media folder",
        "Additional scan folders",
        "Cover folder",
        "Template folder",
        "Bangumi",
        "AniList",
        "Open Library",
        "Create configured folders",
        "Copy default templates",
      ],
    );

    const libraryRoot = definitions.find((definition) => definition.name === "Library root");
    const flatFolder = definitions.find((definition) => definition.name === "Flat media folder");
    assert.equal(libraryRoot?.visible?.(), true);
    assert.equal(flatFolder?.visible?.(), false);

    host.settings.storageMode = "flat";
    assert.equal(libraryRoot?.visible?.(), false);
    assert.equal(flatFolder?.visible?.(), true);
  });
});


describe("version documentation", () => {
  it("records feature-level sessions for the public foundation and 1.1.0", () => {
    const sessions = readFileSync(path.join(process.cwd(), "docs/VERSION_SESSIONS.md"), "utf8");
    const changelog = readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");

    assert.match(sessions, /## 1\.0\.x — Public foundation/);
    assert.match(sessions, /## 1\.1\.0 — Serial reading and novel-volume timeline/);
    assert.match(sessions, /normal series cover, and vertical collision lanes/);
    assert.match(changelog, /## 1\.1\.0 - Unreleased/);
    assert.match(readme, /docs\/VERSION_SESSIONS\.md/);
  });
});

describe("timeline modal and Traditional Chinese labels", () => {
  it("opens the timeline through an Obsidian modal instead of replacing the library view", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    assert.match(mainSource, /new TimelineModal\(this, this\.collectMediaItems\(\)\)\.open\(\)/);
    assert.doesNotMatch(mainSource, /showSection\("timeline"\)/);
  });

  it("shows novel volume labels and uses collision-aware vertical lanes", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
    assert.match(legacySource, /al-timeline-volume-label/);
    assert.match(legacySource, /assignTimelineLanes\(positionedItems, CARD_WIDTH \+ CARD_GAP_X\)/);
    assert.match(legacySource, /aboveAxis = lane % 2 === 0/);
    assert.match(stylesheet, /\.al-timeline-volume-label/);
  });

  it("reuses the approved action labels for the same operation", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    assert.equal(UI_TEXT["action.save"], "儲存");
    assert.equal(UI_TEXT["action.add"], "新增");
    assert.equal(UI_TEXT["action.remove"], "移除");
    assert.equal(UI_TEXT["action.delete"], "刪除");
    assert.equal(UI_TEXT["action.edit"], "編輯");
    assert.equal(UI_TEXT["action.search"], "搜尋");
    assert.equal(UI_TEXT["action.back"], "返回");
    assert.equal(UI_TEXT["action.collect"], "收錄");
    assert.match(legacySource, /save\.textContent = uiText\("action\.save"\)/);
    assert.match(legacySource, /createButton\.textContent = uiText\("action\.add"\)/);
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
    assert.equal(UI_TEXT["media.status.watching"], "追番中");
    assert.equal(UI_TEXT["media.status.plannedAnime"], "待追");
    assert.equal(UI_TEXT["library.timeline"], "時間軸");
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
    assert.equal((settingsSource.match(/\.setHeading\(\)/g) || []).length, 2);
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
