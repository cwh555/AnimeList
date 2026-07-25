import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setRequestUrlMock } from "obsidian";
import { aniListClassificationTest, fetchAniListClassifications } from "../src/anilist-classification";
import { aniListRequestTest, requestAniListGraphQL } from "../src/anilist-client";
import { searchMultilingualProviders } from "../src/multilingual-search";
import type { ExternalMediaResult } from "../src/types";

const testGlobal = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
if (!testGlobal.window) testGlobal.window = globalThis as unknown as Window & typeof globalThis;

function result(id: number): ExternalMediaResult {
  return {
    provider: "anilist",
    sourceId: String(id),
    title: `Work ${id}`,
    originalTitle: `作品 ${id}`,
    romajiTitle: `Work ${id}`,
    mediaType: "anime",
    format: "tv",
    total: 12,
    unit: "episode",
    year: 2020,
    genres: [],
    tags: [],
    rawGenres: [],
    rawTags: [],
    people: [],
    platforms: [],
    sourceUrl: "",
    coverUrl: "",
    summary: "",
    externalScore: null,
    releaseStatus: "finished",
    searchTitles: [`Work ${id} English`, `作品 ${id}`],
  };
}

describe("AniList request control", () => {
  it("deduplicates identical in-flight GraphQL requests", async () => {
    aniListRequestTest.reset();
    aniListRequestTest.setMinimumInterval(0);
    let calls = 0;
    setRequestUrlMock(async () => {
      calls += 1;
      await Promise.resolve();
      return { status: 200, json: { data: { value: 7 } }, headers: {} };
    });
    const [left, right] = await Promise.all([
      requestAniListGraphQL<{ value: number }>("query A", { id: 1 }, "test", { cacheKey: "same" }),
      requestAniListGraphQL<{ value: number }>("query A", { id: 1 }, "test", { cacheKey: "same" }),
    ]);
    assert.deepEqual(left, { value: 7 });
    assert.deepEqual(right, { value: 7 });
    assert.equal(calls, 1);
    setRequestUrlMock(null);
  });

  it("honors Retry-After and retries a 429 only once", async () => {
    aniListRequestTest.reset();
    aniListRequestTest.setMinimumInterval(0);
    let calls = 0;
    setRequestUrlMock(() => {
      calls += 1;
      if (calls === 1) {
        return { status: 429, json: { errors: [{ message: "Too Many Requests" }] }, headers: { "Retry-After": "0.001" } };
      }
      return { status: 200, json: { data: { ok: true } }, headers: {} };
    });
    const value = await requestAniListGraphQL<{ ok: boolean }>("query B", {}, "test", { cacheKey: "retry" });
    assert.deepEqual(value, { ok: true });
    assert.equal(calls, 2);
    setRequestUrlMock(null);
  });

  it("uses AniList only once during multilingual expansion", async () => {
    let aniListCalls = 0;
    let bangumiCalls = 0;
    const response = await searchMultilingualProviders({
      query: "作品 1",
      providers: [
        {
          label: "AniList",
          singleQueryOnly: true,
          initialOnly: true,
          async search(): Promise<ExternalMediaResult[]> {
            aniListCalls += 1;
            return [result(1)];
          },
        },
        {
          label: "Bangumi",
          supportsChineseDiscovery: true,
          async search(): Promise<ExternalMediaResult[]> {
            bangumiCalls += 1;
            return [result(1)];
          },
        },
      ],
      languages: { chinese: true, english: true, original: true },
    });
    assert.equal(aniListCalls, 1);
    assert.ok(bangumiCalls >= 1);
    assert.ok(response.results.length >= 1);
  });

  it("batches 51 AniList classification IDs into two requests", async () => {
    aniListRequestTest.reset();
    aniListClassificationTest.reset();
    aniListRequestTest.setMinimumInterval(0);
    let calls = 0;
    setRequestUrlMock((options: { body: string }) => {
      calls += 1;
      const body = JSON.parse(options.body) as { variables: { ids: number[] } };
      return {
        status: 200,
        headers: {},
        json: {
          data: {
            Page: {
              media: body.variables.ids.map((id) => ({
                id,
                genres: ["Comedy"],
                tags: [],
                startDate: { year: 2020 },
                studios: { nodes: [] },
              })),
            },
          },
        },
      };
    });
    const output = await fetchAniListClassifications(Array.from({ length: 51 }, (_, index) => result(index + 1)), "test");
    assert.equal(output.size, 51);
    assert.equal(calls, 2);
    setRequestUrlMock(null);
  });
});
