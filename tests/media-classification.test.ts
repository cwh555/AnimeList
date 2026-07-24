import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeAniListClassifications } from "../src/anilist-classification";
import { applyClassificationFrontmatter } from "../src/classification-ui";
import {
  attachAniListGenres,
  attachAniListTags,
  classificationSuggestions,
  createClassificationSelection,
  normalizeClassificationValues,
} from "../src/media-classification";
import type { ExternalMediaResult } from "../src/types";

function result(provider: string, sourceId: string): ExternalMediaResult {
  return {
    provider,
    sourceId,
    title: "Example",
    originalTitle: "Example",
    romajiTitle: "Example",
    mediaType: "anime",
    format: "tv",
    total: 12,
    unit: "episode",
    year: 2024,
    genres: [],
    rawGenres: [],
    people: [],
    platforms: [],
    sourceUrl: "",
    coverUrl: "",
    summary: "",
    externalScore: null,
    releaseStatus: "unknown",
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

  it("enriches matching AniList results and ignores unknown API values", () => {
    const matched = result("anilist", "1");
    const unmatched = result("anilist", "2");
    const classifications = new Map([["1", {
      year: 2025,
      genres: ["喜劇"],
      tags: ["異世界"],
    }]]);
    const merged = mergeAniListClassifications([matched, unmatched], classifications);
    assert.deepEqual(merged[0]?.genres, ["喜劇"]);
    assert.deepEqual(merged[0]?.tags, ["異世界"]);
    assert.equal(merged[0]?.year, 2025);
    assert.deepEqual(merged[1]?.genres, []);
    assert.deepEqual(merged[1]?.tags, []);
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

  it("combines built-in and vault-defined suggestions without duplicates", () => {
    const suggestions = classificationSuggestions("tag", ["異世界", "自訂標籤"]);
    assert.equal(suggestions.filter((value) => value === "異世界").length, 1);
    assert.ok(suggestions.includes("自訂標籤"));
  });

  it("writes genres and tags as separate frontmatter arrays", () => {
    const frontmatter: Record<string, unknown> = { title: "Example", unrelated: true };
    applyClassificationFrontmatter(frontmatter, {
      genres: ["喜劇", "自訂類型"],
      tags: ["校園", "自訂標籤"],
    });
    assert.deepEqual(frontmatter.genres, ["喜劇", "自訂類型"]);
    assert.deepEqual(frontmatter.tags, ["校園", "自訂標籤"]);
    assert.equal(frontmatter.unrelated, true);
  });
});
