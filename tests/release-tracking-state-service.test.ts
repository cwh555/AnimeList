import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile } from "obsidian";
import { ReleaseTrackingService } from "../src/data/release-tracking-service";
import { ReleaseTrackingStateService } from "../src/data/release-tracking-state-service";
import type { MangaDexReleaseClient } from "../src/data/providers/mangadex-release-client";
import type { NdlReleaseClient } from "../src/data/providers/ndl-release-client";
import type { MediaItem } from "../src/domain/media-types";

function harness(initial: Record<string, unknown>) {
  const file = new TFile();
  file.path = "AnimeList/Manga/Test.md";
  file.basename = "Test";
  const frontmatter = { ...initial };
  const app = {
    vault: {
      getAbstractFileByPath(path: string) { return path === file.path ? file : null; },
    },
    metadataCache: {
      getFileCache(target: TFile) { return target === file ? { frontmatter } : null; },
    },
    fileManager: {
      async processFrontMatter(target: TFile, apply: (value: Record<string, unknown>) => void) {
        assert.equal(target, file);
        apply(frontmatter);
      },
    },
  };
  return { app: app as any, file, frontmatter };
}

function item(path: string, mediaType: "manga" | "novel" = "manga"): MediaItem {
  return {
    title: "Test",
    originalTitle: "Test",
    mediaType,
    format: mediaType === "manga" ? "manga" : "light_novel",
    status: "ongoing",
    releaseStatus: "releasing",
    progress: mediaType === "manga" ? 120 : 8,
    total: 0,
    unit: mediaType === "manga" ? "chapter" : "volume",
    score: null,
    favorite: false,
    year: 2026,
    genres: [],
    people: [],
    platforms: [],
    sourceUrls: [],
    cover: "",
    filePath: path,
    updated: 0,
    updatedLabel: "",
    startedAt: "",
    completedAt: "",
    volumeLog: [],
  };
}

describe("release tracking persistence", () => {
  it("writes verified release metadata without touching reading progress or unrelated frontmatter", async () => {
    const { app, file, frontmatter } = harness({
      progress: 120,
      progress_unit: "chapter",
      custom_field: "keep-me",
      release_status: "releasing",
    });
    const service = new ReleaseTrackingStateService(app);
    await service.writeVerified(
      file.path,
      "manga",
      { provider: "mangadex", sourceId: "series-1", title: "Test" },
      "147",
      "",
      "https://mangadex.org/title/series-1",
    );

    assert.equal(frontmatter.progress, 120);
    assert.equal(frontmatter.progress_unit, "chapter");
    assert.equal(frontmatter.release_status, "releasing");
    assert.equal(frontmatter.custom_field, "keep-me");
    assert.equal(frontmatter.latest_chapter, "147");
    assert.equal(frontmatter.release_tracking_status, "verified");
    assert.equal(frontmatter.release_tracking_ref, "series-1");
    assert.equal(typeof frontmatter.release_tracking_checked_at, "string");
    assert.equal("release_tracking_verified_at" in frontmatter, false);
  });

  it("requires explicit confirmation for a novel publication line even when only one NDL candidate exists", async () => {
    const { app, file, frontmatter } = harness({ progress: 8, progress_unit: "volume" });
    const mangaDex = {} as MangaDexReleaseClient;
    const ndl = {
      async searchTitles() {
        return [{
          sourceId: "book-9",
          sourceUrl: "https://ndlsearch.ndl.go.jp/books/book-9",
          title: "Example Novel",
          seriesTitle: "Example Novel",
          volume: "9",
          creators: ["Author"],
          publisher: "Publisher",
          publishedAt: "2026-07-01",
          isbn: "9784000000000",
        }];
      },
    } as unknown as NdlReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex, ndl });
    const novel = item(file.path, "novel");
    novel.title = "Example Novel";
    novel.originalTitle = "Example Novel";
    novel.people = ["Author"];

    const result = await service.refreshItem(novel);
    assert.equal(result.kind, "attention");
    assert.equal(result.status, "ambiguous");
    assert.equal(frontmatter.release_tracking_status, "ambiguous");
    assert.equal("latest_volume" in frontmatter, false);
    assert.equal(frontmatter.progress, 8);
  });

  it("persists provider failures while preserving the last verified release", async () => {
    const { app, file, frontmatter } = harness({
      progress: 120,
      release_tracking_provider: "mangadex",
      release_tracking_ref: "series-1",
      release_tracking_title: "Test",
      release_tracking_status: "verified",
      latest_chapter: "147",
    });
    const mangaDex = {
      async search() { return []; },
      async latestChapter() { throw new Error("temporary outage"); },
    } as unknown as MangaDexReleaseClient;
    const ndl = {} as NdlReleaseClient;
    const service = new ReleaseTrackingService(app, { mangaDex, ndl });
    const result = await service.refreshItem(item(file.path));

    assert.equal(result.kind, "attention");
    assert.equal(result.status, "provider_error");
    assert.equal(frontmatter.latest_chapter, "147");
    assert.equal(frontmatter.progress, 120);
    assert.equal(frontmatter.release_tracking_status, "provider_error");
    assert.equal(frontmatter.release_tracking_error, "temporary outage");
  });
});
