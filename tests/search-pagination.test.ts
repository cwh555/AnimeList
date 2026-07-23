import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SEARCH_PAGINATION_LIMITS, mergeSearchPages } from "../src/search-pagination";
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

  it("updates pagination idempotently instead of deleting and recreating it", () => {
    const source = readFileSync(path.join(process.cwd(), "src/search-pagination.ts"), "utf8");
    assert.match(source, /if \(existing\) return;/);
    assert.doesNotMatch(source, /querySelector\("\.al-search-pagination"\)\?\.remove\(\);/);
    assert.match(source, /enhanceQueued/);
    assert.match(source, /PATCH_MARKER/);
  });

  it("restores the outer modal position after the search input focus timer", () => {
    const source = readFileSync(path.join(process.cwd(), "src/search-pagination.ts"), "utf8");
    assert.match(source, /state\.restoreScrollTop = state\.modalEl\.scrollTop/);
    assert.match(source, /function scheduleScrollRestore\(state\)/);
    assert.match(source, /window\.setTimeout\(\(\) => \{\s*window\.requestAnimationFrame/s);
    assert.match(source, /state\.modalEl\.scrollTop = scrollTop/);
    assert.match(source, /restoreScheduled: false/);
  });

  it("uses provider-native pages for additional requests", () => {
    const source = readFileSync(path.join(process.cwd(), "src/search-pagination.ts"), "utf8");
    assert.match(source, /offset = \(page - 1\) \* limit/);
    assert.match(source, /Page\(page: \$page, perPage: 20\)/);
    assert.match(source, /pageInfo \{ hasNextPage \}/);
    assert.match(source, /limit=\$\{limit\}&page=\$\{page\}/);
  });
});