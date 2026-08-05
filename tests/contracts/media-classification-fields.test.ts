import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExternalMediaResult } from "../../src/domain/media-types";
import { mediaClassificationFieldValues, storedMediaClassificationFieldValues } from "../../src/ui/media-classification-fields";
import { detailMediaQuarterLabel, mediaQuarterLabel } from "../../src/ui/media-quarter-label";
import { tagSuggestionValues } from "../../src/ui/tag-chip-control";
import { storedMediaExternalResult, storedMediaNeedsClassificationRefresh } from "../../src/data/stored-media-result";
import { normalizeUserTags } from "../../src/domain/user-tags";

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
    assert.deepEqual(rows.find((row) => row.key === "tags")?.values, ["School"]);
    assert.equal(values.people, "CloverWorks");
    assert.equal(values.season, "2021 Q1 (冬季)");
    assert.equal(values.source, "漫畫");
    assert.equal(values.country, "日本");
    assert.ok(!Object.values(values).some((value) => value.includes("戸松遥")));
    assert.ok(!Object.values(values).some((value) => value.includes("2021年1月")));
  });

  it("shows stored structured metadata, including quarter, in the edit modal data section", () => {
    const rows = storedMediaClassificationFieldValues({
      format: "tv",
      media_tags: ["School", "Coming of Age"],
      studios: ["CloverWorks"],
      season: "winter",
      season_year: 2021,
      source_material: "manga",
      country_of_origin: "JP",
    }, "anime");
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));

    assert.equal(values.format, "TV 動畫");
    assert.equal(values.tags, "School、Coming of Age");
    assert.equal(values.people, "CloverWorks");
    assert.equal(values.season, "2021 Q1 (冬季)");
    assert.equal(values.source, "漫畫");
    assert.equal(values.country, "日本");
  });

  it("normalizes personal tags independently from genres and AniList tags", () => {
    assert.deepEqual(normalizeUserTags([" #重看 ", "治癒系", "重看", "Comfort  Watch"]), [
      "重看",
      "治癒系",
      "Comfort Watch",
    ]);
  });

  it("uses the same quarter label in collection metadata and the library detail summary", () => {
    assert.equal(mediaQuarterLabel("winter", 2021), "2021 Q1 (冬季)");
    assert.equal(detailMediaQuarterLabel("anime", "winter", 2021), "季度 2021 Q1 (冬季)");
    assert.equal(detailMediaQuarterLabel("manga", "winter", 2021), "");
  });
  it("keeps quarter visible in edit metadata while an older note is being enriched", () => {
    const rows = storedMediaClassificationFieldValues({ format: "tv" }, "anime", true);
    const quarter = rows.find((row) => row.key === "season");
    assert.ok(quarter);
    assert.equal(quarter.value, "");
    assert.equal(storedMediaNeedsClassificationRefresh({ format: "tv" }, "anime"), true);
    assert.equal(storedMediaNeedsClassificationRefresh({ season: "winter", season_year: 2021 }, "anime"), false);
  });

  it("reconstructs enough stored identity to refresh missing AniList metadata", () => {
    const stored = storedMediaExternalResult({
      title: "Re：從零開始的異世界生活 新編集版",
      title_original: "Re:ゼロから始める異世界生活 新編集版",
      media_type: "anime",
      format: "tv",
      source_provider: "bangumi",
      source_id: "414337",
      source_urls: ["https://bgm.tv/subject/414337"],
      anilist_id: "39587",
      progress_unit: "episode",
    }, "anime");
    assert.equal(stored.originalTitle, "Re:ゼロから始める異世界生活 新編集版");
    assert.ok(stored.sources?.some((source) => source.provider === "anilist" && source.sourceId === "39587"));
  });

  it("offers existing tags as chips without duplicating already selected tags", () => {
    assert.deepEqual(
      tagSuggestionValues(["重看", "收藏", "School", "收藏"], ["重看"], ""),
      ["收藏", "School"],
    );
    assert.deepEqual(tagSuggestionValues(["重看", "收藏", "School"], [], "sch"), ["School"]);
  });

});
