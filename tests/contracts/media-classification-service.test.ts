import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExternalMediaResult } from "../../src/domain/media-types";
import { MediaClassificationService } from "../../src/data/media-classification-service";
import { dedupeSearchResults } from "../../src/data/provider-normalizers";
import { AniListClient } from "../../src/data/providers/anilist-client";
import { setRequestUrlMock } from "../mocks/obsidian";

function result(overrides: Partial<ExternalMediaResult> = {}): ExternalMediaResult {
  return {
    provider: "bangumi",
    sourceId: "bgm-1",
    title: "測試作品",
    originalTitle: "テスト作品",
    romajiTitle: "Test Work",
    mediaType: "anime",
    format: "tv",
    total: 12,
    unit: "episode",
    year: 2026,
    genres: ["劇情"],
    rawGenres: ["剧情"],
    people: ["Bangumi Studio"],
    platforms: [],
    sourceUrl: "https://bgm.tv/subject/1",
    coverUrl: "",
    summary: "",
    externalScore: 8,
    releaseStatus: "finished",
    searchTitles: ["測試作品", "テスト作品", "Test Work"],
    sources: [{ provider: "bangumi", sourceId: "bgm-1", sourceUrl: "https://bgm.tv/subject/1" }],
    ...overrides,
  };
}

function aniListMedia(id: number, title = "テスト作品"): unknown {
  return {
    id,
    siteUrl: `https://anilist.co/anime/${id}`,
    type: "ANIME",
    format: "TV",
    status: "FINISHED",
    episodes: 12,
    averageScore: 80,
    description: "",
    genres: ["Drama", "Romance"],
    synonyms: ["測試作品"],
    startDate: { year: 2026, month: 4, day: 1 },
    title: { romaji: "Test Work", english: "Test Work", native: title },
    coverImage: {},
    season: "SPRING",
    seasonYear: 2026,
    source: "ORIGINAL",
    countryOfOrigin: "JP",
    tags: [
      { name: "School", category: "Theme", rank: 82, isGeneralSpoiler: false, isMediaSpoiler: false, isAdult: false },
    ],
    studios: { nodes: [{ name: "AniList Producer", isAnimationStudio: false }, { name: "AniList Studio", isAnimationStudio: true }] },
    staff: { edges: [] },
  };
}

describe("media classification service", () => {
  it("uses classification already returned by search without another AniList request", async () => {
    let calls = 0;
    setRequestUrlMock(() => { calls += 1; throw new Error("must not request"); });
    try {
      const source = result({
        classification: {
          anilistId: "42",
          genres: ["戀愛"],
          tags: [],
          season: "spring",
          seasonYear: 2026,
          studios: ["Cached Studio"],
          source: "original",
          countryOfOrigin: "JP",
        },
        sources: [
          { provider: "bangumi", sourceId: "bgm-1", sourceUrl: "https://bgm.tv/subject/1" },
          { provider: "anilist", sourceId: "42", sourceUrl: "https://anilist.co/anime/42" },
        ],
      });
      const enriched = await new MediaClassificationService(new AniListClient()).enrich(source);
      assert.equal(calls, 0);
      assert.deepEqual(enriched.people, ["Cached Studio"]);
      assert.deepEqual(enriched.genres, ["戀愛"]);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("uses a preserved AniList identity for exactly one direct metadata request", async () => {
    let calls = 0;
    let body: any;
    setRequestUrlMock((options) => {
      calls += 1;
      body = JSON.parse(options.body ?? "{}");
      return { headers: {}, json: { data: { Media: aniListMedia(42) } }, text: "" };
    });
    try {
      const source = result({
        sources: [
          { provider: "bangumi", sourceId: "bgm-1", sourceUrl: "https://bgm.tv/subject/1" },
          { provider: "anilist", sourceId: "42", sourceUrl: "https://anilist.co/anime/42" },
        ],
      });
      const enriched = await new MediaClassificationService(new AniListClient()).enrich(source);
      assert.equal(calls, 1);
      assert.equal(body.variables.id, 42);
      assert.equal(enriched.provider, "bangumi");
      assert.equal(enriched.classification?.anilistId, "42");
      assert.deepEqual(enriched.people, ["AniList Studio"]);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("never infers an AniList identity from only a similar name and year", async () => {
    let calls = 0;
    setRequestUrlMock(() => { calls += 1; throw new Error("unexpected cross-provider lookup"); });
    try {
      const source = result();
      const enriched = await new MediaClassificationService(new AniListClient()).enrich(source);
      assert.equal(enriched, source);
      assert.equal(calls, 0);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("does not enrich even a uniquely named work without a verified provider ID", async () => {
    setRequestUrlMock(() => { throw new Error("must not guess an AniList ID"); });
    try {
      const enriched = await new MediaClassificationService(new AniListClient()).enrich(result());
      assert.equal(enriched.classification, undefined);
      assert.equal(enriched.sources?.some(source => source.provider === "anilist"), false);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("preserves AniList identity and classification when cross-provider search results deduplicate", () => {
    const bangumi = result({
      sources: [
        { provider: "bangumi", sourceId: "bgm-1", sourceUrl: "https://bgm.tv/subject/1" },
        { provider: "anilist", sourceId: "101", sourceUrl: "https://anilist.co/anime/101" },
      ],
    });
    const anilist = result({
      provider: "anilist",
      sourceId: "101",
      sourceUrl: "https://anilist.co/anime/101",
      sources: [{ provider: "anilist", sourceId: "101", sourceUrl: "https://anilist.co/anime/101" }],
      classification: {
        anilistId: "101",
        genres: ["戀愛"],
        tags: [],
        season: "spring",
        seasonYear: 2026,
        studios: ["AniList Studio"],
        source: "original",
        countryOfOrigin: "JP",
      },
    });
    const merged = dedupeSearchResults([bangumi, anilist]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.provider, "bangumi");
    assert.equal(merged[0]?.classification?.anilistId, "101");
    assert.deepEqual(merged[0]?.genres, ["戀愛"]);
    assert.deepEqual(merged[0]?.people, ["AniList Studio"]);
    assert.deepEqual(merged[0]?.sources?.map((source) => source.provider), ["bangumi", "anilist"]);
  });

  it("fails open when AniList metadata is unavailable", async () => {
    setRequestUrlMock(() => {
      const error = new Error("AniList unavailable with status 403") as Error & { status: number };
      error.status = 403;
      throw error;
    });
    try {
      const source = result({
        sources: [
          { provider: "bangumi", sourceId: "bgm-1", sourceUrl: "https://bgm.tv/subject/1" },
          { provider: "anilist", sourceId: "42", sourceUrl: "https://anilist.co/anime/42" },
        ],
      });
      const errors: unknown[] = [];
      const enriched = await new MediaClassificationService(new AniListClient()).enrichOrOriginal(
        source,
        (error) => errors.push(error),
      );
      assert.equal(enriched, source);
      assert.equal(errors.length, 1);
    } finally {
      setRequestUrlMock(null);
    }
  });

});
