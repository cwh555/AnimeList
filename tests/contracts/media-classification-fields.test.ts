import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExternalMediaResult } from "../../src/domain/media-types";
import { mediaClassificationFieldValues } from "../../src/ui/media-classification-fields";

function result(): ExternalMediaResult {
  return {
    provider: "bangumi",
    sourceId: "1",
    sourceUrl: "https://bgm.tv/subject/1",
    mediaType: "anime",
    title: "Example",
    originalTitle: "Example",
    romajiTitle: "Example",
    format: "tv",
    year: 2021,
    coverUrl: "",
    genres: ["戀愛", "日常"],
    rawGenres: ["戀愛", "日常"],
    people: ["CloverWorks"],
    platforms: [],
    total: 12,
    unit: "episode",
    summary: "",
    externalScore: null,
    releaseStatus: "finished",
    classification: {
      anilistId: "123",
      genres: ["戀愛", "日常"],
      tags: [
        { name: "School", category: "Theme", rank: 88, isGeneralSpoiler: false, isMediaSpoiler: false, isAdult: false },
        { name: "Spoiler", category: "Theme", rank: 90, isGeneralSpoiler: true, isMediaSpoiler: false, isAdult: false },
        { name: "Low Rank", category: "Theme", rank: 30, isGeneralSpoiler: false, isMediaSpoiler: false, isAdult: false },
      ],
      season: "winter",
      seasonYear: 2021,
      studios: ["CloverWorks"],
      source: "manga",
      countryOfOrigin: "JP",
    },
  };
}

describe("media classification collection fields", () => {
  it("keeps structured metadata in separate collection fields", () => {
    const rows = mediaClassificationFieldValues(result());
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));

    assert.equal(values.format, "TV 動畫");
    assert.equal(values.tags, "School");
    assert.equal(values.people, "CloverWorks");
    assert.equal(values.season, "2021 冬季");
    assert.equal(values.source, "漫畫");
    assert.equal(values.country, "日本");
    assert.ok(!Object.values(values).some((value) => value.includes("戸松遥")));
    assert.ok(!Object.values(values).some((value) => value.includes("2021年1月")));
  });
});
