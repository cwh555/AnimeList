import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import AnimeListPlugin from "../src/main";
import { BUILTIN_TEMPLATES, getBuiltInTemplateOptions } from "../src/builtin-templates";
import { DEFAULT_SETTINGS } from "../src/settings";
import { legacyTest } from "../src/legacy";

const {
  buildMediaMarkdown,
  completedProgress,
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

describe("media note generation", () => {
  const result = {
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

  it("forces completed progress to the total", () => {
    assert.equal(completedProgress("completed", 12, 3), 12);
    assert.equal(completedProgress("watching", 12, 3), 3);
  });

  it("creates Markdown without a custom updated timestamp", () => {
    const markdown = buildMediaMarkdown(result, {
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
    }, "AnimeList/Covers/anime/example.webp", BUILTIN_TEMPLATES["builtin:anime-review"]);

    assert.ok(markdown.includes('title: "Example"'));
    assert.ok(markdown.includes("progress: 12"));
    assert.ok(markdown.includes('completed_at: "2026-01-02"'));
    assert.ok(!markdown.includes("updated_at:"));
    assert.ok(markdown.includes("## 觀後心得"));
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
    assert.ok(animeTemplates.map((item) => item.path).includes("builtin:anime-review"));
  });

  it("supports managed and flat media paths", () => {
    const plugin = Object.create(AnimeListPlugin.prototype) as AnimeListPlugin;
    plugin.settings = structuredClone(DEFAULT_SETTINGS);
    assert.equal(plugin.getMediaFolder("anime"), "AnimeList/Anime");
    plugin.settings.storageMode = "flat";
    plugin.settings.flatMediaFolder = "Library";
    assert.equal(plugin.getMediaFolder("manga"), "Library");
  });
});


describe("timeline modal and Traditional Chinese labels", () => {
  it("opens the timeline through an Obsidian modal instead of replacing the library view", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    assert.match(mainSource, /new TimelineModal\(this, this\.collectMediaItems\(\)\)\.open\(\)/);
    assert.doesNotMatch(mainSource, /showSection\("timeline"\)/);
  });

  it("uses the requested status and timeline labels", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    assert.match(legacySource, /active: "追番中"/);
    assert.match(legacySource, /planned: "待追"/);
    assert.ok(legacySource.includes("<span>時間軸</span>"));
    assert.doesNotMatch(legacySource, /完成時間軸|願望清單|active: "追番"/);
  });
});
