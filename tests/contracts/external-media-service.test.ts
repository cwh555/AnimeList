import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExternalMediaResult, MediaType } from "../../src/domain/media-types";
import {
  ExternalMediaSearchService,
  type MetadataProviderClient,
} from "../../src/data/external-media-service";
import { searchFeatureText } from "../../src/search-feature-text";

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

describe("external media search service", () => {
  it("runs enabled providers over every query variant and merges partial success", async () => {
    const bangumiQueries: string[] = [];
    const anilistQueries: string[] = [];
    const client: MetadataProviderClient = {
      async searchBangumi(_mediaType, query) {
        bangumiQueries.push(query);
        return query.includes("第二季") ? [result("Bangumi", "2", "測試作品 第二季")] : [];
      },
      async searchAniList(_mediaType, query) {
        anilistQueries.push(query);
        throw new Error(`AniList unavailable for ${query}`);
      },
      async searchOpenLibrary() {
        throw new Error("Open Library must not run for anime");
      },
    };
    const service = new ExternalMediaSearchService(
      () => ({ bangumi: true, anilist: true, openlibrary: true }),
      client,
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
    const client: MetadataProviderClient = {
      async searchBangumi() { calls += 1; return []; },
      async searchAniList() { calls += 1; return []; },
      async searchOpenLibrary() { calls += 1; return []; },
    };
    const service = new ExternalMediaSearchService(
      () => ({ bangumi: false, anilist: false, openlibrary: false }),
      client,
    );

    const output = await service.search("novel", "作品");
    assert.equal(calls, 0);
    assert.deepEqual(output.results, []);
    assert.deepEqual(output.warnings, [searchFeatureText("provider.noneEnabled")]);
  });

  it("uses Open Library only for novel searches", async () => {
    const calls: string[] = [];
    const client: MetadataProviderClient = {
      async searchBangumi() { return []; },
      async searchAniList() { return []; },
      async searchOpenLibrary(query) {
        calls.push(query);
        return [result("OpenLibrary", query, query, "novel")];
      },
    };
    const service = new ExternalMediaSearchService(
      () => ({ bangumi: false, anilist: false, openlibrary: true }),
      client,
    );

    const manga = await service.search("manga", "作品");
    assert.equal(calls.length, 0);
    assert.deepEqual(manga.warnings, [searchFeatureText("provider.noneEnabled")]);

    const novel = await service.search("novel", "作品");
    assert.ok(calls.length >= 1);
    assert.ok(novel.results.length >= 1);
  });
});
