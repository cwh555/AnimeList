import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySanitizedClassification,
  automaticClassificationForResult,
  isLegacyGenreFieldLabel,
  sanitizeStoredClassification,
} from "../src/classification-compatibility";
import {
  attachAniListGenres,
  attachAniListTags,
  classificationSuggestions,
  createClassificationSelection,
  normalizeClassificationValues,
} from "../src/media-classification";
import type { ExternalMediaResult } from "../src/types";

function result(overrides: Partial<ExternalMediaResult> = {}): ExternalMediaResult {
  return {
    provider: "anilist",
    sourceId: "1",
    title: "Example",
    originalTitle: "Example",
    romajiTitle: "Example",
    mediaType: "anime",
    format: "tv",
    total: 12,
    unit: "episode",
    year: 2020,
    genres: [],
    tags: [],
    rawGenres: [],
    rawTags: [],
    people: [],
    platforms: [],
    sourceUrl: "",
    coverUrl: "",
    summary: "",
    externalScore: null,
    releaseStatus: "finished",
    ...overrides,
  };
}

describe("media classification", () => {
  it("maps only fixed AniList genres into Traditional Chinese labels", () => {
    assert.deepEqual(
      attachAniListGenres(["Comedy", "Romance", "Unknown Genre", "Sci-Fi"]),
      ["喜劇", "戀愛", "科幻"],
    );
  });

  it("filters AniList tags by catalog, rank, spoiler, and adult metadata", () => {
    assert.deepEqual(attachAniListTags([
      { name: "Isekai", rank: 97 },
      { name: "School", rank: 84 },
      { name: "Revenge", rank: 59 },
      { name: "Dungeon", rank: 91, isMediaSpoiler: true },
      { name: "Unknown Tag", rank: 100 },
      { name: "Military", rank: 80, isAdult: true },
    ]), ["異世界", "校園"]);
  });

  it("matches representative AniList records without leaking titles or years", () => {
    assert.deepEqual(
      attachAniListGenres(["Comedy", "Psychological", "Romance", "Slice of Life"]),
      ["喜劇", "心理", "戀愛", "日常"],
    );
    assert.deepEqual(attachAniListTags([
      { name: "School", rank: 93 },
      { name: "Heterosexual", rank: 89 },
      { name: "Tsundere", rank: 88 },
      { name: "School Club", rank: 86 },
      { name: "Archery", rank: 20 },
    ]), ["校園"]);

    assert.deepEqual(
      attachAniListGenres(["Action", "Drama", "Fantasy", "Mystery"]),
      ["動作", "劇情", "奇幻", "懸疑"],
    );
    assert.deepEqual(attachAniListTags([
      { name: "Revenge", rank: 93 },
      { name: "Military", rank: 88 },
      { name: "Survival", rank: 80 },
      { name: "Vore", rank: 79 },
    ]), ["復仇", "軍事", "生存"]);

    assert.deepEqual(
      attachAniListGenres(["Action", "Adventure", "Drama", "Fantasy", "Horror", "Psychological"]),
      ["動作", "冒險", "劇情", "奇幻", "恐怖", "心理"],
    );
    assert.deepEqual(attachAniListTags([
      { name: "Revenge", rank: 94 },
      { name: "Anti-Hero", rank: 83 },
      { name: "Survival", rank: 82 },
      { name: "Military", rank: 72 },
      { name: "Time Skip", rank: 71 },
      { name: "Coming of Age", rank: 68 },
      { name: "Dungeon", rank: 57 },
    ]), ["復仇", "反英雄", "生存", "軍事", "時間跳躍", "成長"]);
  });

  it("uses AniList as the only automatic classification source", () => {
    assert.deepEqual(automaticClassificationForResult(result({
      provider: "anilist",
      genres: ["喜劇"],
      tags: ["校園"],
    })), { genres: ["喜劇"], tags: ["校園"] });

    assert.deepEqual(automaticClassificationForResult(result({
      provider: "bangumi",
      genres: ["2019", "輝夜大小姐想讓我告白", "戀愛"],
      tags: ["校園"],
    })), { genres: [], tags: [] });

    assert.deepEqual(automaticClassificationForResult(result({
      provider: "openlibrary",
      mediaType: "novel",
      genres: ["1998", "Harry Potter and the Sorcerer's Stone", "Fiction"],
    })), { genres: [], tags: [] });
  });

  it("cleans legacy title, year, and metadata pollution while preserving custom values", () => {
    const clean = sanitizeStoredClassification({
      title: "輝夜大小姐想讓我告白",
      title_original: "かぐや様は告らせたい",
      media_type: "anime",
      format: "tv",
      year: 2019,
      status: "completed",
      source_provider: "anilist",
      genres: [2019, "輝夜大小姐想讓我告白", "Romance", "Isekai", "青春戀愛喜劇"],
      media_tags: ["Comedy", "2019", "かぐや様は告らせたい", "自訂標籤"],
    }, "輝夜大小姐想讓我告白");

    assert.deepEqual(clean.genres, ["戀愛", "青春戀愛喜劇", "喜劇"]);
    assert.deepEqual(clean.tags, ["異世界", "自訂標籤"]);
    assert.deepEqual(clean.removed, ["2019", "輝夜大小姐想讓我告白", "かぐや様は告らせたい"]);
    assert.deepEqual(clean.moved, ["Isekai", "Comedy"]);
  });

  it("removes old non-AniList provider classifications but retains user additions", () => {
    const clean = sanitizeStoredClassification({
      title: "Some Book",
      media_type: "novel",
      source_provider: "openlibrary",
      source_genres: ["Fiction", "1998", "Some Book"],
      genres: ["Fiction", "1998", "Some Book", "我的書架分類"],
      media_tags: ["自訂標籤"],
    }, "Some Book");

    assert.deepEqual(clean.genres, []);
    assert.deepEqual(clean.tags, ["自訂標籤"]);
    assert.deepEqual(clean.removed, ["Fiction", "1998", "Some Book", "我的書架分類"]);
  });

  it("writes cleaned compatibility values without touching unrelated frontmatter", () => {
    const frontmatter: Record<string, unknown> = {
      title: "Attack on Titan",
      media_type: "anime",
      year: 2013,
      keep: { nested: true },
      genres: ["Attack on Titan", "Action"],
      tags: ["project/anime", "2013"],
      media_tags: [2013, "Military"],
    };
    const result = applySanitizedClassification(frontmatter, {
      genres: ["Attack on Titan", "Action", "自訂分類"],
      tags: [2013, "Military", "自訂標籤"],
    }, "Attack on Titan");

    assert.deepEqual(result.genres, ["動作", "自訂分類"]);
    assert.deepEqual(result.tags, ["軍事", "自訂標籤"]);
    assert.deepEqual(frontmatter.genres, ["動作", "自訂分類"]);
    assert.deepEqual(frontmatter.media_tags, ["軍事", "自訂標籤"]);
    assert.deepEqual(frontmatter.tags, ["project/anime", "2013"]);
    assert.deepEqual(frontmatter.keep, { nested: true });
  });

  it("keeps Obsidian note tags separate from media tags", () => {
    const frontmatter: Record<string, unknown> = {
      title: "Example",
      media_type: "anime",
      source_provider: "anilist",
      tags: ["2026", "Example", "project/anime", "School"],
      genres: [],
    };
    const clean = sanitizeStoredClassification(frontmatter, "Example");
    assert.deepEqual(clean.tags, ["校園"]);

    applySanitizedClassification(frontmatter, { genres: [], tags: ["校園", "自訂媒體標籤"] }, "Example");
    assert.deepEqual(frontmatter.tags, ["2026", "Example", "project/anime", "School"]);
    assert.deepEqual(frontmatter.media_tags, ["校園", "自訂媒體標籤"]);
  });

  it("backs up ambiguous legacy provider genres before replacing them", () => {
    const frontmatter: Record<string, unknown> = {
      title: "Some Book",
      media_type: "novel",
      source_provider: "openlibrary",
      genres: ["Fiction", "1998", "我的書架分類"],
    };
    applySanitizedClassification(frontmatter, { genres: [], tags: [] }, "Some Book");
    assert.deepEqual(frontmatter.genres, []);
    assert.deepEqual(frontmatter.classification_legacy_genres, ["Fiction", "1998", "我的書架分類"]);
    assert.equal(frontmatter.classification_version, 1);
  });

  it("does not confuse the media type label with the legacy genre field", () => {
    assert.equal(isLegacyGenreFieldLabel("分類"), true);
    assert.equal(isLegacyGenreFieldLabel("Genre"), true);
    assert.equal(isLegacyGenreFieldLabel("作品類型"), false);
    assert.equal(isLegacyGenreFieldLabel("作品分類"), false);
  });

  it("normalizes built-ins while preserving user-created values", () => {
    assert.deepEqual(
      normalizeClassificationValues(["Comedy", "喜剧", "青春戀愛喜劇"], "genre"),
      ["喜劇", "青春戀愛喜劇"],
    );
    assert.deepEqual(
      createClassificationSelection(["Romance", "自訂類型"], ["Isekai", "自訂標籤"]),
      { genres: ["戀愛", "自訂類型"], tags: ["異世界", "自訂標籤"] },
    );
  });

  it("combines built-in and cleaned vault suggestions without duplicates", () => {
    const clean = sanitizeStoredClassification({
      title: "Example",
      media_type: "anime",
      year: 2026,
      media_tags: ["異世界", "自訂標籤", "Example", 2026],
    }, "Example");
    const suggestions = classificationSuggestions("tag", clean.tags);
    assert.equal(suggestions.filter((value) => value === "異世界").length, 1);
    assert.ok(suggestions.includes("自訂標籤"));
    assert.ok(!suggestions.includes("Example"));
    assert.ok(!suggestions.includes("2026"));
  });
});
