import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App, TFile } from "obsidian";
import {
  CoverThumbnailCache,
  coverCacheGroupKey,
  coverCacheKey,
  coverCachePaths,
  planCoverCacheCleanup,
} from "../src/data/cover-cache";

const record = (filePath: string, size: number, mtime: number) => ({ path: filePath, size, mtime });

describe("cover thumbnail cache", () => {
  it("keys thumbnails by normalized source path and mtime", () => {
    assert.equal(coverCacheKey("AnimeList\\Covers\\a.jpg", 1234), coverCacheKey("AnimeList/Covers/a.jpg", 1234));
    assert.notEqual(coverCacheKey("AnimeList/Covers/a.jpg", 1234), coverCacheKey("AnimeList/Covers/a.jpg", 1235));
  });

  it("can isolate image-section thumbnails from the cover cache without duplicating cache logic", () => {
    const app = { vault: { configDir: ".obsidian" } } as unknown as App;
    const covers = new CoverThumbnailCache(app, "animelist");
    const images = new CoverThumbnailCache(app, "animelist", undefined, "images");
    assert.equal(covers.root, ".obsidian/plugins/animelist/cache/covers");
    assert.equal(images.root, ".obsidian/plugins/animelist/cache/images");
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

  it("moves cache evictions to vault trash instead of permanently removing files", async () => {
    const root = ".obsidian/plugins/animelist/cache/covers";
    const source = `${root}/orphan-320.webp`;
    const files = new Set([source]);
    const directories = new Set([root]);
    const renames: Array<{ from: string; to: string }> = [];
    const app = {
      vault: {
        configDir: ".obsidian",
        adapter: {
          async exists(path: string) { return files.has(path) || directories.has(path); },
          async mkdir(path: string) { directories.add(path); },
          async list(path: string) {
            return path === root ? { files: [...files].filter((entry) => entry.startsWith(`${root}/`)), folders: [] } : { files: [], folders: [] };
          },
          async rename(from: string, to: string) { files.delete(from); files.add(to); renames.push({ from, to }); },
          async remove() { throw new Error("permanent remove must not be used"); },
          getResourcePath(path: string) { return path; },
        },
      },
    } as unknown as App;
    const cache = new CoverThumbnailCache(app, "animelist");

    const removed = await cache.clear();

    assert.equal(removed, 1);
    assert.deepEqual(renames.map((entry) => entry.from), [source]);
    assert.equal(renames[0]?.to.startsWith(".trash/AnimeList/Internal/thumbnail-cache/"), true);
    assert.equal(files.has(source), false);
  });

  it("keeps cache files and reports zero when recoverable trash movement is unavailable", async () => {
    const root = ".obsidian/plugins/animelist/cache/covers";
    const source = `${root}/orphan-320.webp`;
    const files = new Set([source]);
    const app = {
      vault: {
        configDir: ".obsidian",
        adapter: {
          async exists(path: string) { return files.has(path) || path === root; },
          async mkdir() {},
          async list(path: string) {
            return path === root ? { files: [source], folders: [] } : { files: [], folders: [] };
          },
          async remove() { throw new Error("permanent remove must not be used"); },
          getResourcePath(path: string) { return path; },
        },
      },
    } as unknown as App;
    const cache = new CoverThumbnailCache(app, "animelist");

    const removed = await cache.clear();

    assert.equal(removed, 0);
    assert.equal(files.has(source), true);
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

  it("defers cache-miss work until a rendered cover reads its sources", () => {
    const originalWindow = globalThis.window;
    const scheduled: Array<() => void> = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        requestIdleCallback(callback: () => void) {
          scheduled.push(callback);
          return 1;
        },
        cancelIdleCallback() {},
        setTimeout,
        clearTimeout,
      },
    });

    const file = new TFile();
    file.path = "AnimeList/Covers/deferred.jpg";
    (file as TFile & { stat: { mtime: number } }).stat = { mtime: 4321 };
    const app = {
      vault: {
        configDir: ".obsidian",
        adapter: { getResourcePath: (path: string) => `app://${path}` },
      },
    } as unknown as App;
    const cache = new CoverThumbnailCache(app, "animelist");

    try {
      const sources = cache.getDeferredSources(file);
      assert.equal(scheduled.length, 0);
      assert.equal(sources.src, "");
      assert.equal(scheduled.length, 1);
      assert.equal(sources.srcset, "");
      assert.equal(sources.placeholder, "");
      assert.equal(scheduled.length, 1);
    } finally {
      cache.dispose();
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  it("queues one idle worker for repeated cache misses without generating synchronously", async () => {
    const originalWindow = globalThis.window;
    const scheduled: Array<() => void> = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        requestIdleCallback(callback: () => void) {
          scheduled.push(callback);
          return 1;
        },
        cancelIdleCallback() {},
        setTimeout,
        clearTimeout,
      },
    });

    const file = new TFile();
    file.path = "AnimeList/Covers/example.jpg";
    (file as TFile & { stat: { mtime: number } }).stat = { mtime: 1234 };
    let resourceReads = 0;
    const app = {
      vault: {
        configDir: ".obsidian",
        adapter: {
          getResourcePath(path: string) {
            resourceReads += 1;
            return `app://${path}`;
          },
        },
      },
    } as unknown as App;
    const cache = new CoverThumbnailCache(app, "animelist");

    try {
      assert.equal(cache.getSources(file), undefined);
      assert.equal(cache.getSources(file), undefined);
      const result = await cache.optimizeFile(file, false);
      assert.deepEqual(result, {
        src: "app://AnimeList/Covers/example.jpg",
        srcset: "",
        placeholder: "",
      });
      assert.equal(scheduled.length, 1);
      assert.equal(resourceReads, 1);
    } finally {
      cache.dispose();
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
