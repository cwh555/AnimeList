import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classificationFromAniListMedia } from "../src/anilist-classification";
import { preferAniListSearchResults } from "../src/classification-search";
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
    sourceId: "99468",
    title: "Karakai Jouzu no Takagi-san",
    originalTitle: "からかい上手の高木さん",
    romajiTitle: "Karakai Jouzu no Takagi-san",
    mediaType: "anime",
    format: "tv",
    total: 12,
    unit: "episode",
    year: 2018,
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

describe("media classification", () => {
  it("maps broad AniList genres and only promoted high-level tags", () => {
    assert.deepEqual(attachAniListGenres(
      ["Comedy", "Romance", "Slice of Life", "Unknown Genre"],
      [
        { name: "School", rank: 82 },
        { name: "Slapstick", rank: 80 },
        { name: "Dungeon", rank: 99 },
        { name: "Military", rank: 69 },
      ],
    ), ["喜劇", "戀愛", "日常", "校園"]);
  });

  it("never imports provider detail tags automatically", () => {
    assert.deepEqual(attachAniListTags([
      { name: "Dungeon", rank: 99 },
      { name: "Food", rank: 98 },
      { name: "School", rank: 82 },
    ]), []);
  });

  it("preserves user-created values only in manual selections", () => {
    assert.deepEqual(
      normalizeClassificationValues(["Comedy", "喜剧", "青春戀愛喜劇"], "genre"),
      ["喜劇", "青春戀愛喜劇"],
    );
    assert.deepEqual(
      createClassificationSelection(["Romance", "自訂類型"], ["我的標籤"]),
      { genres: ["戀愛", "自訂類型"], tags: ["我的標籤"] },
    );
  });

  it("keeps automatic suggestions limited to the maintained catalog", () => {
    const suggestions = classificationSuggestions("genre", ["污染值"]);
    assert.ok(suggestions.includes("喜劇"));
    assert.equal(suggestions.includes("污染值"), false);
    assert.deepEqual(classificationSuggestions("tag", ["自訂標籤"]), []);
  });

  it("converts representative AniList data to broad classifications", () => {
    assert.deepEqual(classificationFromAniListMedia({
      id: 99468,
      genres: ["Comedy", "Romance", "Slice of Life"],
      tags: [{ name: "School", rank: 82 }, { name: "Slapstick", rank: 80 }],
      startDate: { year: 2018 },
      studios: { nodes: [{ name: "Shin-Ei Animation" }] },
    }), {
      genres: ["喜劇", "戀愛", "日常", "校園"],
      tags: [],
      year: 2018,
      people: ["Shin-Ei Animation"],
    });
  });

  it("keeps AniList as canonical while retaining the localized Bangumi title", () => {
    const [merged] = preferAniListSearchResults([
      result(),
      result({
        provider: "bangumi",
        sourceId: "218712",
        title: "擅長捉弄人的高木同學",
        sourceUrl: "https://bgm.tv/subject/218712",
        genres: [],
        people: [],
      }),
    ]);
    assert.equal(merged.provider, "anilist");
    assert.equal(merged.sourceId, "99468");
    assert.equal(merged.title, "擅長捉弄人的高木同學");
    assert.deepEqual(merged.genres, ["喜劇", "戀愛", "日常", "校園"]);
  });
});
