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

  it("discovers an alternate Chinese localization without hard-coded title synonyms", async () => {
    const calls: string[] = [];
    const response = await searchMultilingualProviders({
      query: "我想成為影之強者",
      providers: [{
        label: "Bangumi",
        supportsChineseDiscovery: true,
        async search(query: string): Promise<ExternalMediaResult[]> {
          calls.push(query);
          if (query !== "成为影之") return [];
          return [result({
            mediaType: "novel", sourceId: "shadow-1",
            title: "想成為影之實力者",
            originalTitle: "陰の実力者になりたくて！",
            searchTitles: ["想成為影之實力者"],
          })];
        },
      }],
    });
    assert.ok(calls.includes("成为影之"));
    assert.equal(response.results[0]?.sourceId, "shadow-1");
    assert.equal(response.results[0]?.title, "想成為影之實力者");
  });

  it("recovers the real Bangumi novel title even when its translation inserts 要", async () => {
    const input = "我想成為影之強者";
    const variants = collectChineseDiscoveryQueries(input);
    assert.ok(variants.includes("成为影之"));
    assert.ok(variants.length <= 5);

    const searched: string[] = [];
    const response = await searchMultilingualProviders({
      query: input,
      providers: [{
        label: "Bangumi",
        supportsChineseDiscovery: true,
        async search(query: string): Promise<ExternalMediaResult[]> {
          searched.push(query);
          // The real Bangumi series is 270200; its cataloged Chinese title
          // includes the extra 要, which defeats the naive 5-char prefix.
          if (!"想要成为影之实力者！".includes(query)) return [];
          return [result({
            provider: "bangumi", sourceId: "270200", mediaType: "novel",
            format: "light_novel",
            title: "想要成為影之實力者！",
            originalTitle: "陰の実力者になりたくて!",
            searchTitles: ["我想要成為影之強者！"],
          })];
        },
      }],
    });
    assert.ok(searched.includes("成为影之"));
    assert.equal(response.results[0]?.sourceId, "270200");
  });

  it("serializes variants for one provider and preserves results before an API failure", async () => {
    const calls: string[] = [];
    let concurrent = 0;
    let peak = 0;
    const response = await searchMultilingualProviders({
      query: "作品 第二季",
      providers: [{
        label: "Sample",
        async search(query: string): Promise<ExternalMediaResult[]> {
          concurrent += 1;
          peak = Math.max(peak, concurrent);
          calls.push(query);
          try {
            await Promise.resolve();
            if (query === "作品") throw new Error("provider temporarily unavailable");
            return [result({ sourceId: "test-1", title: "作品 第二季", searchTitles: [] })];
          } finally {
            concurrent -= 1;
          }
        },
      }],
      languages: { chinese: true, english: true, original: true },
    });
    assert.equal(peak, 2);
    assert.deepEqual(calls, ["作品 第二季", "作品"]);
    assert.equal(response.results.some(x => x.sourceId === "test-1"), true);
    assert.match(response.warnings[0], /temporarily unavailable/);
  });

  it("shows Bangumi's Korean-title hit before another source returns, even without an exposed Chinese alias", async () => {
    const progress: ExternalMediaResult[][] = [];
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const run = searchMultilingualProviders({
      query: "漫畫裡的羅康林",
      providers: [{
        label: "Bangumi",
        supportsChineseDiscovery: true,
        async search(query) {
          if (query !== "漫画里的罗康林") return [];
          return [naKangLim({ searchTitles: ["수요웹툰의 나강림"], title: "수요웹툰의 나강림" })];
        },
      }, {
        label: "AniList",
        async search() {
          await pending;
          return [];
        },
      }],
      onProgress(results) { progress.push(results); },
    });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.ok(progress.some(results => results.some(item => item.sourceId === "399671")));
    release();
    await run;
  });

  it("bounds impossible and ambiguous searches independently of the input length", async () => {
    for (const term of ["不存在的漫畫暫稱甲乙丙丁", "我想成為影之強者"]) {
      const requests: string[] = [];
      const response = await searchMultilingualProviders({
        query: term,
        providers: [{
          label: "Bangumi",
          supportsChineseDiscovery: true,
          async search(query): Promise<ExternalMediaResult[]> {
            requests.push(query);
            return [];
          },
        }],
      });
      assert.deepEqual(response.results, []);
      assert.ok(requests.length <= 4, JSON.stringify(requests));
      assert.equal(new Set(requests).size, requests.length);
    }
  });

  it("emits first-provider results while a second provider is still in flight", async () => {
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    const events: string[] = [];
    const waiting = searchMultilingualProviders({
      query: "輝夜姬想讓人告白",
      providers: [{
        label: "Bangumi",
        async search(): Promise<ExternalMediaResult[]> {
          return [result()];
        },
      }, {
        label: "AniList",
        async search(): Promise<ExternalMediaResult[]> {
          await delayed;
          return [];
        },
      }],
      onProgress(results) {
        if (results.some(candidate => candidate.sourceId === "248175")) events.push("first-result");
      },
    });
    // Wait until the current event-loop turn finishes; this must publish
    // before the deferred second provider has been released.
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.ok(events.includes("first-result"));
    release();
    await waiting;
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
