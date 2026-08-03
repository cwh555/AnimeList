import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CoverSources, MediaItem } from "../src/types";
import { prepareScoreDashboardCoverSources } from "../src/score-dashboard-cover-sources";
import { CoverThumbnailCache } from "../src/cover-cache";
import { TFile, type App } from "obsidian";

function mediaItem(coverSources?: CoverSources): MediaItem {
  return {
    title: "A", originalTitle: "", mediaType: "anime", format: "anime", status: "ongoing",
    releaseStatus: "unknown", progress: 0, total: 0, unit: "episode", score: null, favorite: false,
    year: "", genres: [], people: [], platforms: [], sourceUrls: [], cover: "app://original", coverSources,
    filePath: "AnimeList/Anime/a.md", updated: 0, updatedLabel: "", startedAt: "", completedAt: "", volumeLog: [],
  };
}

function coverFile(): TFile {
  const file = new TFile();
  file.path = "AnimeList/Covers/a.jpg";
  file.stat = { ctime: 0, mtime: 1, size: 10 };
  return file;
}

describe("score dashboard cover sources", () => {
  it("keeps ready cached sources without cloning the item", () => {
    const ready = { src: "small.webp", srcset: "small.webp 320w", placeholder: "tiny.webp" };
    const item = mediaItem(ready);
    const [prepared] = prepareScoreDashboardCoverSources([item]);
    assert.equal(prepared, item);
    assert.equal(prepared.coverSources, ready);
  });

  it("uses the original lazy image path on a cache miss without enqueueing thumbnails", () => {
    const scheduled: unknown[] = [];
    const app = {
      vault: {
        configDir: ".obsidian",
        adapter: {
          getResourcePath: (path: string) => `app://${path}`,
          list: async () => ({ files: [], folders: [] }), exists: async () => true, mkdir: async () => {},
        },
      },
    } as unknown as App;
    const originalWindow = globalThis.window;
    globalThis.window = {
      requestIdleCallback: (callback: IdleRequestCallback) => { scheduled.push(callback); return scheduled.length; },
      cancelIdleCallback: () => {}, clearTimeout: () => {}, setTimeout: () => 1,
    } as unknown as Window & typeof globalThis;
    try {
      const cache = new CoverThumbnailCache(app, "animelist");
      const deferred = cache.getDeferredSources(coverFile());
      const item = mediaItem(deferred);
      const [prepared] = prepareScoreDashboardCoverSources([item]);
      assert.notEqual(prepared, item);
      assert.equal(prepared.coverSources, undefined);
      assert.equal(prepared.cover, "app://original");
      assert.equal(scheduled.length, 0);
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
