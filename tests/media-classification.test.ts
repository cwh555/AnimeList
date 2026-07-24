import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchAniListClassifications, mergeAniListClassifications } from "../src/anilist-classification";
import {
  automaticClassificationForResult,
  isLegacyGenreFieldLabel,
  migrateClassificationFrontmatter,
  sanitizeStoredClassification,
  storedClassificationSelection,
  writeClassificationSelection,
} from "../src/classification-compatibility";
import { CLASSIFICATION_TEXT } from "../src/classification-feature-text";
import { classificationMetadataForResult } from "../src/classification-ui";
import { setRequestUrlMock } from "obsidian";
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
  it("queries exact AniList result ids and restores default classification metadata", async () => {
    const first = result({ sourceId: "101921", genres: [], tags: [], people: [], year: "" });
    const second = result({ sourceId: "110277", genres: [], tags: [], people: [], year: "" });
    let requestBody: Record<string, unknown> | null = null;
    setRequestUrlMock((options) => {
      requestBody = JSON.parse(String(options.body)) as Record<string, unknown>;
      return {
        json: {
          data: {
            Page: {
              media: [{
                id: 101921,
                genres: ["Comedy", "Psychological", "Romance", "Slice of Life"],
                tags: [
                  { name: "School", rank: 93 },
                  { name: "Revenge", rank: 58 },
                  { name: "Dungeon", rank: 90, isMediaSpoiler: true },
                ],
                startDate: { year: 2019 },
                studios: { nodes: [{ name: "A-1 Pictures" }] },
              }, {
                id: 110277,
                genres: ["Action", "Drama"],
                tags: [{ name: "Military", rank: 88 }],
                startDate: { year: 2020 },
                studios: { nodes: [{ name: "MAPPA" }] },
              }],
            },
          },
        },
      };
    });
    try {
      const classifications = await fetchAniListClassifications([first, second], "AnimeList test");
      const body = requestBody as { query?: string; variables?: { ids?: number[] } };
      assert.deepEqual(body.variables?.ids, [101921, 110277]);
      assert.match(body.query ?? "", /media\(id_in:\s*\$ids/);
      assert.match(body.query ?? "", /tags\s*\{/);
      assert.match(body.query ?? "", /studios\(isMain:\s*true\)/);

      const merged = mergeAniListClassifications([first, second], classifications);
      assert.deepEqual(merged[0]?.genres, ["喜劇", "心理", "戀愛", "日常"]);
      assert.deepEqual(merged[0]?.tags, ["校園"]);
      assert.equal(merged[0]?.year, 2019);
      assert.deepEqual(merged[0]?.people, ["A-1 Pictures"]);
      assert.deepEqual(merged[1]?.genres, ["動作", "劇情"]);
      assert.deepEqual(merged[1]?.tags, ["軍事"]);
      assert.equal(merged[1]?.year, 2020);
      assert.deepEqual(merged[1]?.people, ["MAPPA"]);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("keeps existing search results when AniList enrichment has no matching record", () => {
    const existing = result({ genres: ["喜劇"], tags: ["校園"], people: ["A-1 Pictures"], year: 2019 });
    assert.deepEqual(mergeAniListClassifications([existing], new Map()), [existing]);
  });

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

  it("keeps year and production company outside classification values", () => {
    assert.deepEqual(classificationMetadataForResult(result({
      year: 2019,
      people: ["A-1 Pictures"],
      genres: ["喜劇"],
      tags: ["校園"],
    })), [
      { label: "年份", value: "2019" },
      { label: "製作公司", value: "A-1 Pictures" },
    ]);
  });

  it("uses compact labels without provider explanations or empty-state copy", () => {
    assert.equal(CLASSIFICATION_TEXT.genres, "作品分類");
    assert.equal(CLASSIFICATION_TEXT.tags, "作品標籤");
    assert.ok(!Object.values(CLASSIFICATION_TEXT).some((value) => value.includes("AniList 預先附加")));
    assert.ok(!Object.values(CLASSIFICATION_TEXT).some((value) => value.includes("尚未附加")));
  });

  it("does not clean stored values during ordinary reads and writes", () => {
    const frontmatter: Record<string, unknown> = {
      genres: ["2019", "Example", "Comedy", "我的分類"],
      media_tags: ["School", "我的標籤"],
    };
    assert.deepEqual(storedClassificationSelection(frontmatter), {
      genres: ["2019", "Example", "喜劇", "我的分類"],
      tags: ["校園", "我的標籤"],
    });

    writeClassificationSelection(frontmatter, {
      genres: ["2019", "Example", "Comedy", "我的分類"],
      tags: ["School", "我的標籤"],
    });
    assert.deepEqual(frontmatter.genres, ["2019", "Example", "喜劇", "我的分類"]);
    assert.deepEqual(frontmatter.media_tags, ["校園", "我的標籤"]);
    assert.equal(frontmatter.classification_version, undefined);
    assert.equal(frontmatter.classification_legacy_genres, undefined);
  });

  it("cleans only clear metadata when the explicit migration is run", () => {
    const frontmatter: Record<string, unknown> = {
      title: "輝夜大小姐想讓我告白",
      title_original: "かぐや様は告らせたい",
      media_type: "anime",
      format: "tv",
      year: 2019,
      status: "completed",
      source_provider: "anilist",
      genres: [2019, "輝夜大小姐想讓我告白", "Romance", "Isekai", "青春戀愛喜劇"],
      media_tags: ["Comedy", "2019", "かぐや様は告らせたい", "自訂標籤"],
      tags: ["project/anime"],
    };

    const clean = migrateClassificationFrontmatter(frontmatter, "輝夜大小姐想讓我告白");
    assert.deepEqual(clean.genres, ["戀愛", "青春戀愛喜劇", "喜劇"]);
    assert.deepEqual(clean.tags, ["異世界", "自訂標籤"]);
    assert.deepEqual(clean.removed, ["2019", "輝夜大小姐想讓我告白", "かぐや様は告らせたい"]);
    assert.deepEqual(clean.moved, ["Isekai", "Comedy"]);
    assert.deepEqual(frontmatter.classification_legacy_genres, ["2019", "輝夜大小姐想讓我告白", "Romance", "Isekai", "青春戀愛喜劇"]);
    assert.deepEqual(frontmatter.classification_legacy_media_tags, ["Comedy", "2019", "かぐや様は告らせたい", "自訂標籤"]);
    assert.deepEqual(frontmatter.tags, ["project/anime"]);
  });

  it("preserves ambiguous custom values during manual migration", () => {
    const clean = sanitizeStoredClassification({
      title: "Some Book",
      media_type: "novel",
      source_provider: "openlibrary",
      genres: ["Fiction", "1998", "Some Book", "我的書架分類"],
      media_tags: ["自訂標籤"],
    }, "Some Book");

    assert.deepEqual(clean.genres, ["Fiction", "我的書架分類"]);
    assert.deepEqual(clean.tags, ["自訂標籤"]);
    assert.deepEqual(clean.removed, ["1998", "Some Book"]);
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

    migrateClassificationFrontmatter(frontmatter, "Example");
    assert.deepEqual(frontmatter.tags, ["2026", "Example", "project/anime", "School"]);
    assert.deepEqual(frontmatter.media_tags, ["校園"]);
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

  it("combines built-in and stored custom suggestions without duplicates", () => {
    const suggestions = classificationSuggestions("tag", ["異世界", "自訂標籤"]);
    assert.equal(suggestions.filter((value) => value === "異世界").length, 1);
    assert.ok(suggestions.includes("自訂標籤"));
  });
});
