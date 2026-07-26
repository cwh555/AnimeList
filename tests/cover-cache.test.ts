import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  coverCacheGroupKey,
  coverCacheKey,
  coverCachePaths,
  planCoverCacheCleanup,
} from "../src/cover-cache";

const record = (filePath: string, size: number, mtime: number) => ({ path: filePath, size, mtime });

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
    assert.equal(new Set(Object.values(paths).map(coverCacheGroupKey)).size, 1);
  });

  it("removes incomplete and known orphan groups", () => {
    const removals = planCoverCacheCleanup([
      record("cache/orphan-24.webp", 10, 1),
      record("cache/orphan-320.webp", 20, 2),
      record("cache/orphan-640.webp", 30, 3),
      record("cache/incomplete-320.webp", 20, 4),
      record("cache/valid-24.webp", 10, 5),
      record("cache/valid-320.webp", 20, 5),
      record("cache/valid-640.webp", 30, 5),
    ], new Set(["cache/valid", "cache/incomplete"]));
    assert.deepEqual(removals, [
      "cache/incomplete-320.webp",
      "cache/orphan-24.webp",
      "cache/orphan-320.webp",
      "cache/orphan-640.webp",
    ]);
  });

  it("does not expire valid complete groups by age alone", () => {
    const removals = planCoverCacheCleanup([
      record("cache/valid-24.webp", 10, 1),
      record("cache/valid-320.webp", 20, 1),
      record("cache/valid-640.webp", 30, 1),
    ]);
    assert.deepEqual(removals, []);
  });

  it("evicts oldest complete groups until the target size", () => {
    const records = [
      record("cache/a-24.webp", 20, 100), record("cache/a-320.webp", 20, 100), record("cache/a-640.webp", 20, 100),
      record("cache/b-24.webp", 20, 200), record("cache/b-320.webp", 20, 200), record("cache/b-640.webp", 20, 200),
      record("cache/c-24.webp", 20, 300), record("cache/c-320.webp", 20, 300), record("cache/c-640.webp", 20, 300),
    ];
    const removals = planCoverCacheCleanup(records, new Set(["cache/a", "cache/b", "cache/c"]), {
      maxBytes: 150,
      targetBytes: 100,
    });
    assert.deepEqual(removals, [
      "cache/a-24.webp", "cache/a-320.webp", "cache/a-640.webp",
      "cache/b-24.webp", "cache/b-320.webp", "cache/b-640.webp",
    ]);
  });

  it("queues cache misses and keeps generation off scroll handlers", () => {
    const source = readFileSync(path.join(process.cwd(), "src/cover-cache.ts"), "utf8");
    assert.match(source, /if \(!sources\) this\.enqueue\(file\)/);
    assert.match(source, /requestIdleCallback/);
    assert.match(source, /workerHandle/);
    assert.doesNotMatch(source, /addEventListener\(["']scroll/);
    assert.match(source, /if \(!idle\) \{\n      this\.enqueue\(file\)/);
  });
});
