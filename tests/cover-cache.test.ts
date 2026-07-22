import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COVER_CACHE_POLICY,
  coverCacheKey,
  coverCachePaths,
  planCoverCacheCleanup,
} from "../src/cover-cache";

function record(path: string, size: number, mtime: number) {
  return { path, size, mtime };
}

describe("cover thumbnail cache", () => {
  it("keys thumbnails by normalized source path and mtime", () => {
    assert.equal(coverCacheKey("AnimeList\\Covers\\a.jpg", 1234), coverCacheKey("AnimeList/Covers/a.jpg", 1234));
    assert.notEqual(coverCacheKey("AnimeList/Covers/a.jpg", 1234), coverCacheKey("AnimeList/Covers/a.jpg", 1235));
  });

  it("creates a complete immutable thumbnail group", () => {
    const paths = coverCachePaths(".obsidian/plugins/animelist/cache/covers", "Covers/a.jpg", 42);
    assert.match(paths.placeholder, /-24\.webp$/);
    assert.match(paths.small, /-320\.webp$/);
    assert.match(paths.large, /-640\.webp$/);
    assert.equal(new Set(Object.values(paths).map((path) => path.replace(/-(?:24|320|640)\.webp$/, ""))).size, 1);
  });

  it("removes stale variants as one group", () => {
    const now = COVER_CACHE_POLICY.maxAgeMs + 10_000;
    const removals = planCoverCacheCleanup([
      record("cache/old-24.webp", 10, 1),
      record("cache/old-320.webp", 20, 2),
      record("cache/old-640.webp", 30, 3),
      record("cache/new-24.webp", 10, now),
      record("cache/new-320.webp", 20, now),
      record("cache/new-640.webp", 30, now),
    ], now);
    assert.deepEqual(removals, ["cache/old-24.webp", "cache/old-320.webp", "cache/old-640.webp"]);
  });

  it("evicts oldest complete groups until the target size", () => {
    const removals = planCoverCacheCleanup([
      record("cache/a-24.webp", 20, 100),
      record("cache/a-320.webp", 20, 100),
      record("cache/a-640.webp", 20, 100),
      record("cache/b-24.webp", 20, 200),
      record("cache/b-320.webp", 20, 200),
      record("cache/b-640.webp", 20, 200),
      record("cache/c-24.webp", 20, 300),
      record("cache/c-320.webp", 20, 300),
      record("cache/c-640.webp", 20, 300),
    ], 300, { maxAgeMs: 10_000, maxBytes: 150, targetBytes: 100 });
    assert.deepEqual(removals, ["cache/a-24.webp", "cache/a-320.webp", "cache/a-640.webp", "cache/b-24.webp", "cache/b-320.webp", "cache/b-640.webp"]);
  });
});
