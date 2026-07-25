import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  installClassificationSearchRuntime,
  selectableAniListResults,
} from "../src/classification-search-runtime";
import type { ExternalMediaResult, MediaType } from "../src/types";

function media(overrides: Partial<ExternalMediaResult> = {}): ExternalMediaResult {
  return {
    provider: "anilist",
    sourceId: "1",
    title: "Cowboy Bebop",
    originalTitle: "カウボーイビバップ",
    romajiTitle: "Cowboy Bebop",
    mediaType: "anime",
    format: "tv",
    total: 26,
    unit: "episode",
    year: 1998,
    season: 4,
    genres: ["動作", "科幻"],
    tags: [],
    rawGenres: [],
    rawTags: [],
    people: [],
    platforms: [],
    sourceUrl: "https://anilist.co/anime/1",
    coverUrl: "",
    summary: "",
    externalScore: null,
    releaseStatus: "finished",
    ...overrides,
  };
}

describe("classification search runtime installation", () => {
  it("installs canonical search before the add modal opens", () => {
    const originalSearchExternal = async () => ({ results: [] as ExternalMediaResult[], warnings: [] as string[] });
    let canonicalSearchWasInstalled = false;
    const host = {
      settings: {
        providers: { anilist: true, bangumi: true, openlibrary: false },
        searchLanguages: { chinese: true, english: true, original: true },
      },
      searchExternal: originalSearchExternal,
      openAddModal(_initialType: MediaType = "anime") {
        canonicalSearchWasInstalled = this.searchExternal !== originalSearchExternal;
      },
      async searchAniList() { return []; },
      async searchBangumi() { return []; },
      async searchOpenLibrary() { return []; },
    };

    installClassificationSearchRuntime(host as never);
    host.openAddModal("anime");
    assert.equal(canonicalSearchWasInstalled, true);
  });

  it("allows only AniList results that already contain canonical genres", () => {
    const results = selectableAniListResults([
      media({ provider: "bangumi", sourceId: "253", genres: ["戀愛"] }),
      media({
        sourceId: "2",
        title: "Unclassified work",
        originalTitle: "Unclassified work",
        romajiTitle: "Unclassified work",
        year: 2000,
        genres: [],
      }),
      media({ sourceId: "1", genres: ["動作", "科幻"] }),
    ]);

    assert.deepEqual(results.map((result) => result.sourceId), ["1"]);
    assert.ok(results.every((result) => result.provider === "anilist"));
    assert.ok(results.every((result) => result.genres.length > 0));
  });
});
