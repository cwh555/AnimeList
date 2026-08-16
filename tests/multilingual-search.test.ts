import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectChineseDiscoveryQueries,
  traditionalToSimplifiedQuery,
} from "../src/domain/search/chinese-variants";
import {
  collectMultilingualSearchQueries,
  normalizeSearchLanguageSettings,
  searchMultilingualProviders,
} from "../src/app/search/multilingual-search";
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

function naKangLim(overrides: Partial<ExternalMediaResult> = {}): ExternalMediaResult {
  return result({
    provider: "bangumi",
    sourceId: "399671",
    sourceUrl: "https://bgm.tv/subject/399671",
    mediaType: "manga",
    title: "漫画里的罗康林",
    originalTitle: "수요웹툰의 나강림",
    romajiTitle: "Suyo Webtoon-ui Na Kang-Rim",
    format: "manhwa",
    year: 2021,
    total: 0,
    unit: "chapter",
    searchTitles: [
      "漫画里的罗康林",
      "Webtoon Character Na Kang Lim",
      "Webtoon Character Na Kang-Lim",
      "수요웹툰의 나강림",
    ],
    ...overrides,
  });
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

  it("creates bounded Simplified Chinese discovery queries from a Traditional Chinese title", () => {
    assert.equal(traditionalToSimplifiedQuery("漫畫裡的羅康林"), "漫画里的罗康林");
    const queries = collectChineseDiscoveryQueries("漫畫裡的羅康林");
    assert.ok(queries.includes("漫画里的罗康林"));
    assert.ok(queries.includes("羅康林"));
    assert.ok(queries.includes("罗康林"));
    assert.ok(queries.length <= 5);
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

  it("finds 漫畫裡的羅康林 through Chinese discovery, then English and Korean aliases", async () => {
    const calls: string[] = [];
    const bangumi = {
      label: "Bangumi",
      supportsChineseDiscovery: true,
      async search(query: string): Promise<ExternalMediaResult[]> {
        calls.push(`bangumi:${query}`);
        return query === "漫画里的罗康林" || query === "罗康林" ? [naKangLim()] : [];
      },
    };
    const anilist = {
      label: "AniList",
      async search(query: string): Promise<ExternalMediaResult[]> {
        calls.push(`anilist:${query}`);
        if (query !== "Webtoon Character Na Kang Lim"
            && query !== "Webtoon Character Na Kang-Lim"
            && query !== "수요웹툰의 나강림") return [];
        return [naKangLim({
          provider: "anilist",
          sourceId: "138705",
          sourceUrl: "https://anilist.co/manga/138705",
          title: "Suyo Webtoon-ui Na Kang-Rim",
        })];
      },
    };

    const response = await searchMultilingualProviders({
      query: "漫畫裡的羅康林",
      providers: [bangumi, anilist],
      languages: { chinese: true, english: true, original: true },
    });

    assert.ok(calls.includes("bangumi:漫画里的罗康林"));
    assert.ok(response.expandedQueries.some((query) => query.startsWith("Webtoon Character Na Kang")));
    assert.ok(response.expandedQueries.includes("수요웹툰의 나강림"));
    assert.equal(response.results.some((item) => item.provider === "anilist" && item.sourceId === "138705"), true);
  });

  it("does not issue disabled language discovery or alias expansions", async () => {
    const queries: string[] = [];
    const response = await searchMultilingualProviders({
      query: "漫畫裡的羅康林",
      providers: [{
        label: "Bangumi",
        supportsChineseDiscovery: true,
        async search(query: string): Promise<ExternalMediaResult[]> {
          queries.push(query);
          return [];
        },
      }],
      languages: { chinese: false, english: false, original: false },
    });
    assert.deepEqual(response.expandedQueries, []);
    assert.deepEqual(queries, ["漫畫裡的羅康林"]);
  });
});
