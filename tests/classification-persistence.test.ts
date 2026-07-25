import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyResolvedMediaMetadata } from "../src/classification-create-persistence";
import { applyCanonicalMigrationMetadata } from "../src/classification-migration";
import { releaseDateMetadata, releaseSeasonLabel } from "../src/release-season";
import type { ExternalMediaResult } from "../src/types";

function result(overrides: Partial<ExternalMediaResult> = {}): ExternalMediaResult {
  return {
    provider: "anilist",
    sourceId: "99468",
    title: "擅長捉弄人的高木同學",
    originalTitle: "からかい上手の高木さん",
    romajiTitle: "Karakai Jouzu no Takagi-san",
    mediaType: "anime",
    format: "tv",
    total: 12,
    unit: "episode",
    year: 2018,
    season: 1,
    genres: ["喜劇", "戀愛", "日常", "校園"],
    tags: [],
    rawGenres: ["Comedy", "Romance", "Slice of Life"],
    rawTags: [],
    people: ["Shin-Ei Animation"],
    platforms: [],
    sourceUrl: "https://anilist.co/anime/99468",
    coverUrl: "",
    summary: "",
    externalScore: null,
    releaseStatus: "finished",
    searchTitles: ["Teasing Master Takagi-san"],
    ...overrides,
  };
}

describe("release season metadata", () => {
  it("normalizes months to seasonal starting months", () => {
    assert.deepEqual(releaseDateMetadata(2026, 1), { year: 2026, season: 1 });
    assert.deepEqual(releaseDateMetadata(2026, 4), { year: 2026, season: 4 });
    assert.deepEqual(releaseDateMetadata(2026, 8), { year: 2026, season: 7 });
    assert.deepEqual(releaseDateMetadata(2026, 12), { year: 2026, season: 10 });
    assert.equal(releaseSeasonLabel(7), "夏季");
  });

  it("persists canonical classifications for newly created notes", () => {
    const frontmatter: Record<string, unknown> = { genres: [], tags: ["污染值"], year: 0 };
    applyResolvedMediaMetadata(frontmatter, result());
    assert.deepEqual(frontmatter.genres, ["喜劇", "戀愛", "日常", "校園"]);
    assert.equal(frontmatter.media_tags, undefined);
    assert.equal(frontmatter.tags, undefined);
    assert.equal(frontmatter.year, 2018);
    assert.equal(frontmatter.season, 1);
  });

  it("rebuilds legacy genres while preserving custom media tags and unrelated data", () => {
    const frontmatter: Record<string, unknown> = {
      genres: ["Comedy", "2018", "TV", "錯誤資料"],
      media_tags: ["我的標籤"],
      title: "擅長捉弄人的高木同學",
      custom_field: "preserve me",
    };
    applyCanonicalMigrationMetadata(frontmatter, result(), "擅長捉弄人的高木同學");
    assert.deepEqual(frontmatter.genres, ["喜劇", "戀愛", "日常", "校園"]);
    assert.deepEqual(frontmatter.media_tags, ["我的標籤"]);
    assert.equal(frontmatter.custom_field, "preserve me");
    assert.equal(frontmatter.year, 2018);
    assert.equal(frontmatter.season, 1);
    assert.deepEqual(frontmatter.classification_legacy_genres, ["Comedy", "2018", "TV", "錯誤資料"]);
  });
});
