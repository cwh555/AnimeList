import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installClassificationSearchRuntime } from "../src/classification-search-runtime";
import type { ExternalMediaResult, MediaType } from "../src/types";

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
});
