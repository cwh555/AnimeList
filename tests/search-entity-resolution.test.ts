import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExternalMediaResult } from "../src/domain/media-types";
import { deduplicateMediaIdentities, sameMediaIdentity } from "../src/domain/search/entity-resolution";
import { SearchSession } from "../src/data/search-session";

function media(provider: string, sourceId: string, overrides: Partial<ExternalMediaResult> = {}): ExternalMediaResult {
  return {
    provider, sourceId, sourceUrl: "https://example.test/" + provider + "/" + sourceId,
    title: "Same translated title", originalTitle: "同じ原題", romajiTitle: "",
    mediaType: "anime", format: "tv", year: 2026, total: 12, unit: "episode",
    genres: [], rawGenres: [], people: [], platforms: [],
    coverUrl: "", summary: "", externalScore: null, releaseStatus: "finished",
    ...overrides,
  };
}

describe("search entity resolution", () => {
  it("does not equate titles, year, format, or original title with verified identity", () => {
    const items = deduplicateMediaIdentities([
      media("bangumi", "1"),
      media("anilist", "2"),
    ]);
    assert.equal(items.length, 2);
    assert.equal(sameMediaIdentity(items[0], items[1]), false);
  });

  it("coalesces exact IDs, retaining aliases without mutating either result", () => {
    const left = media("bangumi", "1", { searchTitles: ["Chinese title"] });
    const right = media("bangumi", "1", { searchTitles: ["Japanese title"] });
    const merged = deduplicateMediaIdentities([left, right]);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0].searchTitles, ["Chinese title", "Japanese title", "Same translated title", "同じ原題"]);
    assert.equal(left.searchTitles?.length, 1);
    assert.equal(merged[0].sources?.length, 1);
  });

  it("merges distinct providers only if they share a verified source reference", () => {
    const b = media("bangumi", "1", {
      sources: [
        { provider: "bangumi", sourceId: "1", sourceUrl: "https://bgm.tv/subject/1" },
        { provider: "anilist", sourceId: "5", sourceUrl: "https://anilist.co/anime/5" },
      ],
    });
    const a = media("anilist", "5", {
      classification: {
        anilistId: "5", genres: ["Romance"], tags: [],
        season: "spring", seasonYear: 2026, studios: ["Studio"], source: "original",
        countryOfOrigin: "JP",
      },
    });
    const merged = deduplicateMediaIdentities([b, a]);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0].sources?.map(x => x.provider), ["bangumi", "anilist"]);
    assert.equal(merged[0].classification?.anilistId, "5");
  });

  it("does not merge incompatible types or conflicting provider identifiers", () => {
    const b = media("bangumi", "1", {
      sources: [
        { provider: "bangumi", sourceId: "1", sourceUrl: "" },
        { provider: "anilist", sourceId: "5", sourceUrl: "" },
      ],
    });
    assert.equal(deduplicateMediaIdentities([b, media("anilist", "5", { mediaType: "novel" })]).length, 2);
    const conflict = media("anilist", "5", {
      sources: [
        { provider: "bangumi", sourceId: "2", sourceUrl: "" },
        { provider: "anilist", sourceId: "5", sourceUrl: "" },
      ],
    });
    assert.equal(deduplicateMediaIdentities([b, conflict]).length, 2);
  });

  it("keeps a later-page alias from reappearing after a verified identity was shown", () => {
    const linked = media("bangumi", "1");
    const session = new SearchSession("anime", "Same", [], [linked], []);
    assert.deepEqual(session.takePage().map(item => item.sourceId), ["1"]);
    session.addCandidates([
      media("anilist", "5", {
        sources: [
          { provider: "anilist", sourceId: "5", sourceUrl: "" },
          { provider: "bangumi", sourceId: "1", sourceUrl: "" },
        ],
      }),
    ]);
    assert.deepEqual(session.takePage(), []);
    assert.equal(session.hasMore, false);
  });

  it("retains distinct same-title records across search pages without shared IDs", () => {
    const session = new SearchSession("anime", "Same", [], [media("bangumi", "1")], []);
    session.takePage();
    session.addCandidates([media("anilist", "5")]);
    assert.deepEqual(session.takePage().map(item => item.sourceId), ["5"]);
  });

  it("never merges records without a stable ID", () => {
    const x = media("", "");
    assert.equal(deduplicateMediaIdentities([x, x]).length, 2);
  });
});
