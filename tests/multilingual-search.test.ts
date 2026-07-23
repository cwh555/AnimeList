import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectMultilingualSearchQueries,
  normalizeSearchLanguageSettings,
  searchMultilingualProviders,
} from "../src/multilingual-search";
import type { ExternalMediaResult } from "../src/types";

function result(overrides: Partial<ExternalMediaResult> = {}): ExternalMediaResult {
  return {
    provider: "bangumi",
    sourceId: "248175",
    sourceUrl: "https://bgm.tv/subject/248175",
    mediaType: "anime",
    title: "輝夜大小姐想讓我告白～天才們的戀愛頭腦戰～",
    originalTitle: "かぐや様は告らせたい～天才たちの恋愛頭脳戦～",
    romajiTitle: "Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen",
    format: "tv",
    year: 2019,
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
    searchTitles: [
      "Kaguya-sama: Love is War",
      "輝夜姬想讓人告白～天才們的戀愛頭腦戰～",
    ],
    ...overrides,
  };
}

describe("multilingual provider search", () => {
  it("keeps stored false values and defaults missing language settings", () => {
    assert.deepEqual(normalizeSearchLanguageSettings({ chinese: false, english: true }), {
      chinese: false,
      english: true,
      original: true,
    });
  });

  it("derives Chinese, English, and work-native queries from provider metadata", () => {
    const queries = collectMultilingualSearchQueries(
      "輝夜姬想讓人告白",
      [result()],
      { chinese: true, english: true, original: true },
    );
    assert.ok(queries.includes("Kaguya-sama: Love is War"));
    assert.ok(queries.some((query) => query.includes("かぐや様は告らせたい")));
    assert.ok(queries.some((query) => query.includes("輝夜大小姐")));
  });

  it("uses discovered aliases to recover results from another provider", async () => {
    const calls: string[] = [];
    const bangumi = {
      label: "Bangumi",
      async search(query: string): Promise<ExternalMediaResult[]> {
        calls.push(`bangumi:${query}`);
        return query.includes("輝夜") ? [result()] : [];
      },
    };
    const anilist = {
      label: "AniList",
      async search(query: string): Promise<ExternalMediaResult[]> {
        calls.push(`anilist:${query}`);
        if (query !== "Kaguya-sama: Love is War" && !query.startsWith("かぐや様")) return [];
        return [result({
          provider: "anilist",
          sourceId: "101921",
          sourceUrl: "https://anilist.co/anime/101921",
          title: "Kaguya-sama: Love is War",
        })];
      },
    };

    const response = await searchMultilingualProviders({
      query: "輝夜姬想讓人告白",
      providers: [bangumi, anilist],
      languages: { chinese: true, english: true, original: true },
    });

    assert.ok(response.expandedQueries.includes("Kaguya-sama: Love is War"));
    assert.ok(calls.includes("anilist:Kaguya-sama: Love is War"));
    assert.equal(response.results.some((item) => item.provider === "anilist"), true);
  });

  it("does not issue disabled language expansions", async () => {
    const queries: string[] = [];
    const response = await searchMultilingualProviders({
      query: "輝夜姬想讓人告白",
      providers: [{
        label: "Bangumi",
        async search(query: string): Promise<ExternalMediaResult[]> {
          queries.push(query);
          return query.includes("輝夜") ? [result()] : [];
        },
      }],
      languages: { chinese: false, english: false, original: false },
    });
    assert.deepEqual(response.expandedQueries, []);
    assert.equal(queries.every((query) => query.includes("輝夜")), true);
  });
});
