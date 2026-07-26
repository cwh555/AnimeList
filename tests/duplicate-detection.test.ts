import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findConfidentDuplicate, type StoredMediaIdentity } from "../src/duplicate-detection";
import type { ExternalMediaResult } from "../src/types";

const storedSecondSeason: StoredMediaIdentity = {
  filePath: "AnimeList/Anime/Kaguya S2.md",
  title: "輝夜姬想讓人告白？",
  originalTitle: "かぐや様は告らせたい？",
  romajiTitle: "Kaguya-sama wa Kokurasetai?",
  aliases: ["Kaguya-sama: Love is War?", "輝夜大小姐想讓我告白 第二季"],
  mediaType: "anime",
  format: "tv",
  year: 2020,
  total: 12,
  provider: "bangumi",
  sourceId: "293049",
  sourceUrls: ["https://bgm.tv/subject/293049"],
};

function animeResult(overrides: Partial<ExternalMediaResult> = {}): ExternalMediaResult {
  return {
    provider: "anilist",
    sourceId: "112641",
    sourceUrl: "https://anilist.co/anime/112641",
    mediaType: "anime",
    title: "Kaguya-sama: Love is War?",
    originalTitle: "かぐや様は告らせたい？",
    romajiTitle: "Kaguya-sama wa Kokurasetai?",
    format: "tv",
    year: 2020,
    coverUrl: "",
    genres: [],
    rawGenres: [],
    people: [],
    platforms: [],
    total: 12,
    unit: "episode",
    summary: "",
    externalScore: null,
    releaseStatus: "finished",
    searchTitles: ["輝夜大小姐想讓我告白 第二季", "Kaguya-sama: Love is War Season 2"],
    ...overrides,
  };
}

describe("confident duplicate detection", () => {
  it("matches the same anime across providers only with exact titles and matching metadata", () => {
    const duplicate = findConfidentDuplicate(animeResult(), [storedSecondSeason]);
    assert.deepEqual(duplicate, {
      filePath: storedSecondSeason.filePath,
      title: storedSecondSeason.title,
      reason: "canonical-titles",
    });
  });

  it("does not warn for a different season even when generic titles and metadata match", () => {
    const stored: StoredMediaIdentity = {
      ...storedSecondSeason,
      title: "Example Series",
      originalTitle: "作品",
      romajiTitle: "Sakuhin",
      aliases: ["Example Series", "作品 第二季", "Example Series Season 2"],
      year: 2024,
    };
    const duplicate = findConfidentDuplicate(animeResult({
      title: "Example Series",
      originalTitle: "作品",
      romajiTitle: "Sakuhin",
      year: 2024,
      searchTitles: ["作品 第一季", "Example Series Season 1"],
    }), [stored]);
    assert.equal(duplicate, null);
  });

  it("does not warn for a movie, special, or side story with a shared franchise title", () => {
    const stored: StoredMediaIdentity = {
      ...storedSecondSeason,
      title: "Example Series",
      originalTitle: "作品",
      romajiTitle: "Sakuhin",
      aliases: ["Example Series", "作品"],
      format: "special",
      year: 2024,
      total: 1,
    };
    const duplicate = findConfidentDuplicate(animeResult({
      title: "Example Series",
      originalTitle: "作品",
      romajiTitle: "Sakuhin",
      format: "special",
      year: 2024,
      total: 1,
      searchTitles: ["Example Series Side Story", "作品 外傳"],
    }), [stored]);
    assert.equal(duplicate, null);
  });

  it("always recognizes an identical provider source ID", () => {
    const duplicate = findConfidentDuplicate(animeResult({
      provider: "bangumi",
      sourceId: "293049",
      title: "A user-edited display title",
      originalTitle: "",
      searchTitles: [],
    }), [storedSecondSeason]);
    assert.equal(duplicate?.reason, "source");
  });
});
