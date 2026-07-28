import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setRequestUrlMock } from "./mocks/obsidian";
import {
  SEARCH_PAGINATION_LIMITS,
  appendNextSearchPage,
  appendSearchResultRows,
  mergeSearchPages,
} from "../src/search-pagination";
import type { ExternalMediaResult } from "../src/types";

function result(id: number): ExternalMediaResult {
  return {
    provider: "anilist",
    sourceId: String(id),
    title: `Title ${id}`,
    originalTitle: "",
    romajiTitle: "",
    mediaType: "anime",
    format: "tv",
    total: 12,
    unit: "episode",
    year: 2026,
    genres: [],
    rawGenres: [],
    people: [],
    platforms: [],
    sourceUrl: "",
    coverUrl: "",
    summary: "",
    externalScore: null,
    releaseStatus: "finished",
  };
}

function aniListPayload(id: number, hasNextPage: boolean): unknown {
  return {
    data: {
      Page: {
        pageInfo: { hasNextPage },
        media: [{
          id,
          siteUrl: `https://anilist.co/anime/${id}`,
          type: "ANIME",
          format: "TV",
          status: "FINISHED",
          episodes: 12,
          chapters: null,
          volumes: null,
          averageScore: 80,
          description: "",
          genres: [],
          synonyms: [],
          startDate: { year: 2026, month: 1, day: 1 },
          title: { romaji: `Title ${id}`, english: `Title ${id}`, native: `Title ${id}` },
          coverImage: { extraLarge: "", large: "", medium: "" },
          studios: { nodes: [] },
          staff: { edges: [] },
        }],
      },
    },
  };
}

describe("search pagination", () => {
  it("keeps bounded product limits", () => {
    assert.deepEqual(SEARCH_PAGINATION_LIMITS, { pageSize: 24, maxLoads: 2, maxResults: 72 });
  });

  it("appends unique pages without moving existing results", () => {
    const merged = mergeSearchPages([result(1), result(2)], [[result(2), result(3)], [result(4)]]);
    assert.deepEqual(merged.map((item) => item.sourceId), ["1", "2", "3", "4"]);
  });

  it("caps merged results at 72", () => {
    const initial = Array.from({ length: 24 }, (_, index) => result(index));
    const pageTwo = Array.from({ length: 24 }, (_, index) => result(index + 24));
    const pageThree = Array.from({ length: 40 }, (_, index) => result(index + 48));
    const merged = mergeSearchPages(initial, [pageTwo, pageThree]);
    assert.equal(merged.length, 72);
    assert.equal(merged[71]?.sourceId, "71");
  });

  it("appends rows in place without replacing the result container", () => {
    const target = {
      scrollTop: 640,
      children: ["existing"],
      appendChild(node: string) { this.children.push(node); },
    };
    const appended = appendSearchResultRows(target, [result(2), result(3)], (item) => item.sourceId);
    assert.equal(appended, 2);
    assert.equal(target.scrollTop, 640);
    assert.deepEqual(target.children, ["existing", "2", "3"]);
  });

  it("loads page two into the live modal without rerendering or changing scroll", async () => {
    let requestedPage = 0;
    setRequestUrlMock((options: { body?: string }) => {
      const body = JSON.parse(options.body ?? "{}") as { variables?: { page?: number } };
      requestedPage = body.variables?.page ?? 0;
      return { json: aniListPayload(2, true), text: "", headers: {} };
    });

    const contentEl = { scrollTop: 640 };
    const rows = {
      children: ["1"],
      appendChild(node: string) { this.children.push(node); },
    };
    let renderCalls = 0;
    const modal = {
      plugin: {
        settings: { providers: { bangumi: false, anilist: true, openlibrary: false } },
      },
      mediaType: "anime",
      query: "Title",
      results: [result(1)],
      warnings: [],
      contentEl,
      renderSearch() { renderCalls += 1; },
      async search() {},
      createResultRow(item: ExternalMediaResult) { return item.sourceId; },
    };
    const state = {
      signature: "anime\u0000Title",
      results: [result(1)],
      warnings: [],
      loads: 0,
      hasMore: true,
      loading: false,
      initialSearchPending: false,
    };

    try {
      const appended = await appendNextSearchPage(
        { providers: { bangumi: false, anilist: true, openlibrary: false } } as never,
        modal as never,
        state,
        rows as never,
      );
      assert.equal(appended, 1);
      assert.equal(requestedPage, 2);
      assert.equal(renderCalls, 0);
      assert.equal(contentEl.scrollTop, 640);
      assert.deepEqual(rows.children, ["1", "2"]);
      assert.deepEqual(modal.results.map((item) => item.sourceId), ["1", "2"]);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("stops requesting after two additional pages", async () => {
    let requests = 0;
    setRequestUrlMock(() => {
      requests += 1;
      return { json: aniListPayload(3, true), text: "", headers: {} };
    });
    const modal = {
      plugin: { settings: { providers: { bangumi: false, anilist: true, openlibrary: false } } },
      mediaType: "anime",
      query: "Title",
      results: [result(1)],
      warnings: [],
      contentEl: { scrollTop: 0 },
      renderSearch() {},
      async search() {},
      createResultRow(item: ExternalMediaResult) { return item.sourceId; },
    };
    const state = {
      signature: "anime\u0000Title",
      results: [result(1)],
      warnings: [],
      loads: SEARCH_PAGINATION_LIMITS.maxLoads,
      hasMore: true,
      loading: false,
      initialSearchPending: false,
    };
    const rows = { appendChild() {} };

    try {
      assert.equal(await appendNextSearchPage(
        { providers: { bangumi: false, anilist: true, openlibrary: false } } as never,
        modal as never,
        state,
        rows as never,
      ), 0);
      assert.equal(requests, 0);
    } finally {
      setRequestUrlMock(null);
    }
  });
});
