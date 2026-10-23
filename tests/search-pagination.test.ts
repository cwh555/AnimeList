import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SEARCH_PAGINATION_LIMITS,
  appendNextSearchPage,
  appendSearchResultRows,
  mergeSearchPages,
  synchronizePaginationState,
} from "../src/features/search/pagination";
import type { ExternalMediaResult, ExternalMediaSearchPage } from "../src/types";

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

function page(results: ExternalMediaResult[], hasMore: boolean): ExternalMediaSearchPage {
  return { results, warnings: [], hasMore };
}

describe("search pagination", () => {
  it("keeps bounded product limits", () => {
    assert.deepEqual(SEARCH_PAGINATION_LIMITS, { pageSize: 24, maxLoads: 2, maxResults: 72 });
  });

  it("keeps Load more available after an empty initial page when the provider has a cursor", () => {
    const modal = {
      mediaType: "novel", query: "different title", results: [], warnings: [], hasMore: true,
      contentEl: { scrollTop: 0 }, renderSearch() {}, async search() {},
      createResultRow(item: ExternalMediaResult) { return item.sourceId; },
    };
    const state = {
      signature: "", results: [result(100)], warnings: [],
      loads: 0, hasMore: false, loading: false, sourceResults: null,
    };
    synchronizePaginationState(modal as never, state);
    assert.equal(state.hasMore, true);
    assert.deepEqual(state.results, []);
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

  it("loads page two through the host service without rerendering or changing scroll", async () => {
    let requestedPage = 0;
    const host = {
      async searchExternalPage(_mediaType: string, _query: string, pageNumber: number) {
        requestedPage = pageNumber;
        return page([result(2)], true);
      },
    };
    const initialResults = [result(1)];
    const contentEl = { scrollTop: 640 };
    const rows = {
      children: ["1"],
      appendChild(node: string) { this.children.push(node); },
    };
    let renderCalls = 0;
    const modal = {
      mediaType: "anime",
      query: "Title",
      results: initialResults,
      warnings: [],
      contentEl,
      renderSearch() { renderCalls += 1; },
      async search() {},
      createResultRow(item: ExternalMediaResult) { return item.sourceId; },
    };
    const state = {
      signature: "anime\u0000Title",
      results: [...initialResults],
      warnings: [],
      loads: 0,
      hasMore: true,
      loading: false,
      sourceResults: initialResults,
    };

    const appended = await appendNextSearchPage(host as never, modal as never, state, rows as never);
    assert.equal(appended, 1);
    assert.equal(requestedPage, 2);
    assert.equal(renderCalls, 0);
    assert.equal(contentEl.scrollTop, 640);
    assert.deepEqual(rows.children, ["1", "2"]);
    assert.deepEqual(modal.results.map((item) => item.sourceId), ["1", "2"]);
    assert.equal(state.sourceResults, modal.results);
    assert.equal(state.loading, false);
  });

  it("permits a second Load more after the first one succeeds", async () => {
    const pages: number[] = [];
    const host = {
      async searchExternalPage(_type: string, _query: string, pageNumber: number) {
        pages.push(pageNumber);
        return page([result(pageNumber)], pageNumber < 3);
      },
    };
    const first = [result(1)];
    const modal = {
      mediaType: "anime", query: "Title", results: first, warnings: [],
      contentEl: { scrollTop: 0 }, renderSearch() {}, async search() {},
      createResultRow(item: ExternalMediaResult) { return item.sourceId; },
    };
    const state = {
      signature: "anime\u0000Title", results: [...first], warnings: [],
      loads: 0, hasMore: true, loading: false, sourceResults: first,
    };
    const rows = { children: ["1"], appendChild(value: string) { this.children.push(value); } };
    assert.equal(await appendNextSearchPage(host as never, modal as never, state, rows as never), 1);
    assert.equal(state.loading, false);
    assert.equal(await appendNextSearchPage(host as never, modal as never, state, rows as never), 1);
    assert.equal(state.loading, false);
    assert.deepEqual(pages, [2, 3]);
    assert.deepEqual(rows.children, ["1", "2", "3"]);
  });

  it("resets loaded pages when the same query is searched again", async () => {
    let requestedPage = 0;
    const host = {
      async searchExternalPage(_mediaType: string, _query: string, pageNumber: number) {
        requestedPage = pageNumber;
        return page([result(3)], false);
      },
    };
    const previousResults = [result(1), result(2)];
    const refreshedResults = [result(1)];
    const modal = {
      mediaType: "anime",
      query: "Title",
      results: refreshedResults,
      warnings: [],
      contentEl: { scrollTop: 0 },
      renderSearch() {},
      async search() {},
      createResultRow(item: ExternalMediaResult) { return item.sourceId; },
    };
    const state = {
      signature: "anime\u0000Title",
      results: [...previousResults],
      warnings: ["old warning"],
      loads: 1,
      hasMore: true,
      loading: false,
      sourceResults: previousResults,
    };
    const rows = {
      children: ["1"],
      appendChild(node: string) { this.children.push(node); },
    };

    synchronizePaginationState(modal as never, state);
    assert.equal(state.loads, 0);
    assert.deepEqual(state.results.map((item) => item.sourceId), ["1"]);
    assert.deepEqual(state.warnings, []);
    assert.equal(state.sourceResults, refreshedResults);

    const appended = await appendNextSearchPage(host as never, modal as never, state, rows as never);
    assert.equal(appended, 1);
    assert.equal(requestedPage, 2);
    assert.deepEqual(rows.children, ["1", "3"]);
  });

  it("ignores an old Load more response after a new search replaces the result list", async () => {
    let finish!: (value: ExternalMediaSearchPage) => void;
    const host = {
      async searchExternalPage() {
        return await new Promise<ExternalMediaSearchPage>(resolve => { finish = resolve; });
      },
    };
    const original = [result(1)];
    const modal = {
      mediaType: "anime", query: "First",
      results: original, warnings: [], hasMore: true,
      contentEl: { scrollTop: 0 },
      renderSearch() {}, async search() {},
      createResultRow(item: ExternalMediaResult) { return item.sourceId; },
    };
    const state = {
      signature: "anime\u0000First", results: [...original], warnings: [],
      loads: 0, hasMore: true, loading: false, sourceResults: original,
    };
    const rows = { children: ["1"], appendChild(value: string) { this.children.push(value); } };
    const pending = appendNextSearchPage(host as never, modal as never, state, rows as never);
    const replacement = [result(20)];
    modal.results = replacement;
    modal.query = "Second";
    synchronizePaginationState(modal as never, state);
    finish(page([result(2)], false));
    assert.equal(await pending, 0);
    assert.deepEqual(rows.children, ["1"]);
    assert.deepEqual(modal.results.map(item => item.sourceId), ["20"]);
    assert.equal(state.signature, "anime\u0000Second");
  });

  it("rejects prior Load more results even when the same query is searched again", async () => {
    let finish!: (value: ExternalMediaSearchPage) => void;
    const host = {
      async searchExternalPage() {
        return await new Promise<ExternalMediaSearchPage>(resolve => { finish = resolve; });
      },
    };
    const first = [result(1)];
    const modal = {
      mediaType: "anime", query: "Title",
      results: first, warnings: [], hasMore: true,
      contentEl: { scrollTop: 0 },
      renderSearch() {}, async search() {},
      createResultRow(item: ExternalMediaResult) { return item.sourceId; },
    };
    const state = {
      signature: "anime\u0000Title", results: [...first], warnings: [],
      loads: 0, hasMore: true, loading: false, sourceResults: first,
    };
    const rows = { children: ["1"], appendChild(value: string) { this.children.push(value); } };
    const pending = appendNextSearchPage(host as never, modal as never, state, rows as never);
    modal.results = [result(10)];
    synchronizePaginationState(modal as never, state);
    finish(page([result(2)], false));
    assert.equal(await pending, 0);
    assert.deepEqual(rows.children, ["1"]);
    assert.deepEqual(modal.results.map(item => item.sourceId), ["10"]);
  });

  it("stops requesting after two additional pages", async () => {
    let requests = 0;
    const host = {
      async searchExternalPage() {
        requests += 1;
        return page([result(3)], true);
      },
    };
    const initialResults = [result(1)];
    const modal = {
      mediaType: "anime",
      query: "Title",
      results: initialResults,
      warnings: [],
      contentEl: { scrollTop: 0 },
      renderSearch() {},
      async search() {},
      createResultRow(item: ExternalMediaResult) { return item.sourceId; },
    };
    const state = {
      signature: "anime\u0000Title",
      results: [...initialResults],
      warnings: [],
      loads: SEARCH_PAGINATION_LIMITS.maxLoads,
      hasMore: true,
      loading: false,
      sourceResults: initialResults,
    };
    const rows = { appendChild() {} };

    assert.equal(await appendNextSearchPage(host as never, modal as never, state, rows as never), 0);
    assert.equal(requests, 0);
  });
  it("passes a session ID to Load more and rejects the result after an ID switch", async () => {
    let finish!: (value: ExternalMediaSearchPage) => void;
    let requestedId = "";
    const host = {
      async searchExternalPage(_type: string, _query: string, _page: number, sessionId?: string) {
        requestedId = sessionId ?? "";
        return new Promise<ExternalMediaSearchPage>(resolve => { finish = resolve; });
      },
    };
    const first = [result(1)];
    const modal = {
      mediaType: "anime" as const, query: "Title", sessionId: "original",
      results: first, warnings: [], hasMore: true,
      contentEl: { scrollTop: 5 }, async search() {}, renderSearch() {},
      createResultRow(item: ExternalMediaResult) { return item.sourceId; },
    };
    const state = {
      signature: ["anime", "Title"].join(String.fromCharCode(0)), results: [...first],
      warnings: [], loads: 0, hasMore: true, loading: false,
      sourceResults: first, sessionId: "original",
    };
    const rows = { children: ["1"], appendChild(node: string) { this.children.push(node); } };
    const pending = appendNextSearchPage(host as never, modal as never, state, rows as never);
    assert.equal(requestedId, "original");
    modal.sessionId = "replacement";
    state.sessionId = "replacement";
    finish(page([result(2)], false));
    assert.equal(await pending, 0);
    assert.deepEqual(rows.children, ["1"]);
    assert.equal(state.loads, 0);
  });

  it("keeps ID-less results distinct when both come from one provider", () => {
    const one = { ...result(1), sourceId: "", title: "First unidentified work" };
    const two = { ...result(2), sourceId: "", title: "Second unidentified work" };
    assert.deepEqual(
      mergeSearchPages([one], [[two]]).map(item => item.title),
      ["First unidentified work", "Second unidentified work"],
    );
  });

});
