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
  it("matches the same anime across providers only with two exact titles and matching metadata", () => {
    const duplicate = findConfidentDuplicate(animeResult(), [storedSecondSeason]);
    assert.deepEqual(duplicate, {
      filePath: storedSecondSeason.filePath,
      title: storedSecondSeason.title,
      reason: "canonical-titles",
    });
  });

  it("does not warn for a different season", () => {
    const duplicate = findConfidentDuplicate(animeResult({
      sourceId: "101921",
      title: "Kaguya-sama: Love is War",
      originalTitle: "かぐや様は告らせたい",
      romajiTitle: "Kaguya-sama wa Kokurasetai",
      year: 2019,
      searchTitles: ["輝夜大小姐想讓我告白", "Kaguya-sama: Love is War Season 1"],
    }), [storedSecondSeason]);
    assert.equal(duplicate, null);
  });

  it("does not warn for a movie, special, or side story with a shared franchise title", () => {
    const duplicate = findConfidentDuplicate(animeResult({
      sourceId: "125367",
      title: "Kaguya-sama: Love is War -The First Kiss That Never Ends-",
      originalTitle: "かぐや様は告らせたい-ファーストキッスは終わらない-",
      format: "special",
      year: 2022,
      total: 4,
      searchTitles: ["輝夜姬想讓人告白－永不結束的初吻－", "Kaguya-sama special"],
    }), [storedSecondSeason]);
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
