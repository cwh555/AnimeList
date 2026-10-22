import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExternalMediaResult, MediaType } from "../../src/domain/media-types";
import type {
  MetadataProviderClient,
  MetadataProviderClients,
  MetadataProviderId,
  MetadataProviderPage,
} from "../../src/data/external-media-provider";
import { ExternalMediaSearchService } from "../../src/data/external-media-service";
import { searchFeatureText } from "../../src/features/search/text";

function result(
  provider: string,
  sourceId: string,
  title: string,
  mediaType: MediaType = "anime",
): ExternalMediaResult {
  return {
    provider,
    sourceId,
    title,
    originalTitle: title,
    romajiTitle: "",
    mediaType,
    format: mediaType,
    total: 0,
    unit: mediaType === "anime" ? "episode" : "volume",
    year: "",
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

function client(
  id: MetadataProviderId,
  label: string,
  supports: (mediaType: MediaType) => boolean,
  searchPage: (mediaType: MediaType, query: string, page: number) => Promise<MetadataProviderPage>,
  supportsChineseDiscovery = false,
): MetadataProviderClient {
  return { id, label, supports, searchPage, supportsChineseDiscovery };
}

function clients(overrides: Partial<MetadataProviderClients> = {}): MetadataProviderClients {
  const empty = async (): Promise<MetadataProviderPage> => ({ results: [], hasMore: false });
  return {
    bangumi: client("bangumi", "Bangumi", () => true, empty, true),
    anilist: client("anilist", "AniList", () => true, empty),
    openlibrary: client("openlibrary", "Open Library", (mediaType) => mediaType === "novel", empty),
    ...overrides,
  };
}

describe("external media search service", () => {
  it("runs enabled providers over every query variant and merges partial success", async () => {
    const bangumiQueries: string[] = [];
    const anilistQueries: string[] = [];
    const providerClients = clients({
      bangumi: client("bangumi", "Bangumi", () => true, async (_mediaType, query) => {
        bangumiQueries.push(query);
        return {
          results: query.includes("第二季") ? [result("Bangumi", "2", "測試作品 第二季")] : [],
          hasMore: false,
        };
      }, true),
      anilist: client("anilist", "AniList", () => true, async (_mediaType, query) => {
        anilistQueries.push(query);
        throw new Error(`AniList unavailable for ${query}`);
      }),
    });
    const service = new ExternalMediaSearchService(
      () => ({ bangumi: true, anilist: true, openlibrary: true }),
      providerClients,
    );

    const output = await service.search("anime", "測試作品 第二季");
    assert.ok(bangumiQueries.length > 1);
    assert.ok(anilistQueries.every((query) => bangumiQueries.includes(query)));
    assert.ok(bangumiQueries.length >= anilistQueries.length);
    assert.ok(bangumiQueries.includes("測試作品 第二季"));
    assert.deepEqual(output.results.map((item) => item.sourceId), ["2"]);
    assert.equal(output.warnings.length, 1);
    assert.match(output.warnings[0], /^AniList: AniList unavailable/);
  });

  it("does not call disabled providers and returns the catalog warning when none are enabled", async () => {
    let calls = 0;
    const counting = async (): Promise<MetadataProviderPage> => {
      calls += 1;
      return { results: [], hasMore: false };
    };
    const service = new ExternalMediaSearchService(
      () => ({ bangumi: false, anilist: false, openlibrary: false }),
      clients({
        bangumi: client("bangumi", "Bangumi", () => true, counting, true),
        anilist: client("anilist", "AniList", () => true, counting),
        openlibrary: client("openlibrary", "Open Library", (mediaType) => mediaType === "novel", counting),
      }),
    );

    const output = await service.search("novel", "作品");
    assert.equal(calls, 0);
    assert.deepEqual(output.results, []);
    assert.deepEqual(output.warnings, [searchFeatureText("provider.noneEnabled")]);
  });

  it("uses Open Library only for novel searches", async () => {
    const calls: string[] = [];
    const service = new ExternalMediaSearchService(
      () => ({ bangumi: false, anilist: false, openlibrary: true }),
      clients({
        openlibrary: client("openlibrary", "Open Library", (mediaType) => mediaType === "novel", async (_mediaType, query) => {
          calls.push(query);
          return { results: [result("OpenLibrary", query, query, "novel")], hasMore: false };
        }),
      }),
    );

    const manga = await service.search("manga", "作品");
    assert.equal(calls.length, 0);
    assert.deepEqual(manga.warnings, [searchFeatureText("provider.noneEnabled")]);

    const novel = await service.search("novel", "作品");
    assert.ok(calls.length >= 1);
    assert.ok(novel.results.length >= 1);
  });

  it("batches AniList query variants through the provider client without changing search expansion", async () => {
    const batches: string[][] = [];
    const anilist: MetadataProviderClient = {
      id: "anilist",
      label: "AniList",
      supports: () => true,
      searchPage: async () => {
        throw new Error("single-query AniList path should not run for expanded search");
      },
      searchPages: async (_mediaType, queries) => {
        batches.push([...queries]);
        return queries.map(() => ({ results: [], hasMore: false }));
      },
    };
    const service = new ExternalMediaSearchService(
      () => ({ bangumi: false, anilist: true, openlibrary: false }),
      clients({ anilist }),
    );

    await service.search("anime", "測試作品 第二季");
    assert.equal(batches.length, 1);
    assert.ok(batches[0].length > 1);
    assert.equal(batches[0][0], "測試作品 第二季");
  });

  it("keeps fallback query expansion and requested-season ranking across providers", async () => {
    const calls: string[] = [];
    const providerClients = clients({
      bangumi: client("bangumi", "Bangumi", () => true, async (_mediaType, query) => {
        calls.push(`bangumi:${query}`);
        return { results: [], hasMore: false };
      }, true),
      anilist: client("anilist", "AniList", () => true, async (_mediaType, query) => {
        calls.push(`anilist:${query}`);
        if (query !== "輝夜姬想讓人告白") return { results: [], hasMore: false };
        return {
          results: [
            { ...result("anilist", "101921", "Kaguya-sama: Love is War"), year: 2019, searchTitles: ["辉夜大小姐想让我告白"] },
            { ...result("anilist", "112641", "Kaguya-sama: Love is War?"), year: 2020, searchTitles: ["Kaguya-sama: Love is War Season 2", "辉夜大小姐想让我告白 第二季"] },
          ],
          hasMore: false,
        };
      }),
    });
    const service = new ExternalMediaSearchService(
      () => ({ bangumi: true, anilist: true, openlibrary: false }),
      providerClients,
    );

    const response = await service.search("anime", "輝夜姬想讓人告白第二季");
    assert.equal(response.results[0]?.sourceId, "112641");
    assert.ok(calls.includes("bangumi:輝夜姬想讓人告白第二季"));
    assert.ok(calls.includes("bangumi:輝夜姬想讓人告白"));
    assert.ok(calls.includes("anilist:輝夜姬想讓人告白第二季"));
    assert.ok(calls.includes("anilist:輝夜姬想讓人告白"));
  });

  it("keeps translated subtitle results returned by a broader Bangumi query", async () => {
    const providerClients = clients({
      bangumi: client("bangumi", "Bangumi", () => true, async (_mediaType, query) => ({
        results: query === "輝夜姬想讓人告白"
          ? [{
            ...result("bangumi", "425211", "辉夜大小姐想让我告白-初吻不会结束-"),
            originalTitle: "かぐや様は告らせたい-ファーストキッスは終わらない-",
            format: "special",
            year: 2022,
            releaseStatus: "finished",
            searchTitles: ["輝夜姬想讓人告白－永不結束的初吻－"],
          }]
          : [],
        hasMore: false,
      }), true),
    });
    const service = new ExternalMediaSearchService(
      () => ({ bangumi: true, anilist: false, openlibrary: false }),
      providerClients,
    );

    const response = await service.search("anime", "輝夜姬想讓人告白 永不結束的初吻");
    assert.equal(response.results.some((item) => item.sourceId === "425211"), true);
  });

  it("continues from expanded Chinese search queries instead of restarting with the input title", async () => {
    const calls: string[] = [];
    const service = new ExternalMediaSearchService(
      () => ({ bangumi: true, anilist: false, openlibrary: false }),
      clients({
        bangumi: client("bangumi", "Bangumi", () => true, async (_type, query, page) => {
          calls.push(`${query}:${page}`);
          if (query !== "想成為影之") return { results: [], hasMore: false };
          if (page === 1) return {
            results: [result("bangumi", "novel-1", "想成為影之實力者", "novel")],
            hasMore: true,
          };
          return {
            results: [result("bangumi", "novel-2", "想成為影之實力者 後篇", "novel")],
            hasMore: false,
          };
        }, true),
      }),
    );
    const first = await service.search("novel", "我想成為影之強者");
    assert.deepEqual(first.results.map(x => x.sourceId), ["novel-1"]);
    const next = await service.searchPage("novel", "我想成為影之強者", 2);
    assert.deepEqual(next.results.map(x => x.sourceId), ["novel-2"]);
    assert.ok(calls.includes("想成為影之:2"));
    assert.equal(calls.includes("我想成為影之強者:2"), false);
    assert.equal(next.hasMore, false);
  });

  it("serves first-page overflow before sending further provider requests", async () => {
    let calls = 0;
    const service = new ExternalMediaSearchService(
      () => ({ bangumi: true, anilist: false, openlibrary: false }),
      clients({
        bangumi: client("bangumi", "Bangumi", () => true, async () => {
          calls += 1;
          return {
            results: Array.from({ length: 30 }, (_, i) => result("bangumi", String(i), "Title " + i)),
            hasMore: false,
          };
        }, true),
      }),
    );
    const first = await service.search("anime", "Title");
    const callsAfterFirst = calls;
    const second = await service.searchPage("anime", "Title", 2);
    assert.equal(first.results.length, 24);
    assert.equal(second.results.length, 6);
    assert.equal(calls, callsAfterFirst);
    assert.equal(second.hasMore, false);
  });

  it("fills a partially buffered page from the original provider cursor", async () => {
    const calls: number[] = [];
    const service = new ExternalMediaSearchService(
      () => ({ bangumi: true, anilist: false, openlibrary: false }),
      clients({
        bangumi: client("bangumi", "Bangumi", () => true, async (_type, query, page) => {
          calls.push(page);
          if (page === 1) return {
            results: Array.from({ length: 25 }, (_, index) => result("bangumi", String(index), query)),
            hasMore: true,
          };
          return {
            results: Array.from({ length: 23 }, (_, index) => result("bangumi", String(index + 25), query)),
            hasMore: false,
          };
        }),
      }),
    );
    const first = await service.search("anime", "Example");
    const second = await service.searchPage("anime", "Example", 2);
    assert.equal(first.results.length, 24);
    assert.equal(second.results.length, 24);
    assert.equal(new Set([...first.results, ...second.results].map(value => value.sourceId)).size, 48);
    assert.deepEqual(calls, [1, 2]);
    assert.equal(second.hasMore, false);
  });

  it("uses the same provider clients for pagination and keeps partial provider success", async () => {
    const calls: string[] = [];
    const service = new ExternalMediaSearchService(
      () => ({ bangumi: true, anilist: true, openlibrary: false }),
      clients({
        bangumi: client("bangumi", "Bangumi", () => true, async (mediaType, query, page) => {
          calls.push(`bangumi:${mediaType}:${query}:${page}`);
          return { results: [result("bangumi", "b2", "Page Two")], hasMore: true };
        }, true),
        anilist: client("anilist", "AniList", () => true, async (mediaType, query, page) => {
          calls.push(`anilist:${mediaType}:${query}:${page}`);
          throw new Error("rate limited");
        }),
      }),
    );

    const output = await service.searchPage("anime", "Page Two", 2);
    assert.deepEqual(calls, ["bangumi:anime:Page Two:2", "anilist:anime:Page Two:2"]);
    assert.deepEqual(output.results.map((item) => item.sourceId), ["b2"]);
    assert.equal(output.hasMore, true);
    assert.deepEqual(output.warnings, ["AniList: rate limited"]);
  });
});
