import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile } from "obsidian";
import { ReleaseTrackingStateService } from "../src/data/release-tracking-state-service";
import {
  isReleaseTrackingEnabled,
  releaseTrackingItemsForRefresh,
} from "../src/domain/release-tracking-enrollment";
import type { MediaItem } from "../src/domain/media-types";

function item(path: string, status: MediaItem["status"] = "ongoing"): MediaItem {
  return {
    title: "Test", originalTitle: "Test", mediaType: "manga", format: "manga", status, releaseStatus: "releasing",
    progress: 120, total: 0, unit: "chapter", score: null, favorite: false, year: 2026, genres: [], people: [],
    platforms: [], sourceUrls: [], cover: "", filePath: path, updated: 0, updatedLabel: "", startedAt: "", completedAt: "", volumeLog: [],
  };
}

function harness(initial: Record<string, unknown>) {
  const file = new TFile();
  file.path = "AnimeList/Manga/Test.md";
  file.basename = "Test";
  const frontmatter = { ...initial };
  const app = {
    vault: { getAbstractFileByPath(path: string) { return path === file.path ? file : null; } },
    metadataCache: { getFileCache(target: TFile) { return target === file ? { frontmatter } : null; } },
    fileManager: {
      async processFrontMatter(target: TFile, apply: (value: Record<string, unknown>) => void) {
        assert.equal(target, file);
        apply(frontmatter);
      },
    },
  };
  return { app: app as any, file, frontmatter };
}

describe("release tracking enrollment", () => {
  it("keeps fresh completed titles out by default while preserving existing completed tracking", () => {
    const fresh = harness({ progress: 120, progress_unit: "chapter" });
    const existing = harness({
      release_tracking_status: "verified",
      release_tracking_provider: "mangadex",
      release_tracking_ref: "series-1",
      latest_chapter: "147",
    });
    const freshState = new ReleaseTrackingStateService(fresh.app);
    const existingState = new ReleaseTrackingStateService(existing.app);

    assert.equal(isReleaseTrackingEnabled(item(fresh.file.path, "completed"), freshState.read(fresh.file.path, "manga"), false), false);
    assert.equal(isReleaseTrackingEnabled(item(existing.file.path, "completed"), existingState.read(existing.file.path, "manga"), true), true);
    assert.equal(isReleaseTrackingEnabled(item(fresh.file.path, "ongoing"), freshState.read(fresh.file.path, "manga"), false), true);
  });

  it("manual enrollment persists an explicit status without changing unrelated frontmatter", async () => {
    const { app, file, frontmatter } = harness({ progress: 120, custom_field: "keep-me" });
    const state = new ReleaseTrackingStateService(app);
    const completed = item(file.path, "completed");

    assert.equal(isReleaseTrackingEnabled(completed, state.read(file.path, "manga"), state.hasExplicitStatus(file.path)), false);
    assert.equal(await state.enable(file.path, "manga"), true);
    assert.equal(frontmatter.release_tracking_status, "unconfigured");
    assert.equal(frontmatter.custom_field, "keep-me");
    assert.equal(isReleaseTrackingEnabled(completed, state.read(file.path, "manga"), state.hasExplicitStatus(file.path)), true);
  });

  it("filters refresh enrollment so completed titles join only after explicit opt-in", async () => {
    const { app, file } = harness({ progress: 120 });
    const state = new ReleaseTrackingStateService(app);
    const completed = item(file.path, "completed");
    const filter = () => releaseTrackingItemsForRefresh(
      [completed],
      (candidate) => state.read(candidate.filePath, candidate.mediaType),
      (candidate) => state.hasExplicitStatus(candidate.filePath),
    );

    assert.deepEqual(filter(), []);
    await state.enable(file.path, "manga");
    assert.deepEqual(filter().map((candidate) => candidate.filePath), [file.path]);
  });

  it("re-enables an explicitly disabled title without erasing its binding or latest release", async () => {
    const { app, file, frontmatter } = harness({
      release_tracking_status: "disabled",
      release_tracking_provider: "mangadex",
      release_tracking_ref: "series-1",
      latest_chapter: "147",
    });
    const state = new ReleaseTrackingStateService(app);

    assert.equal(await state.enable(file.path, "manga"), true);
    assert.equal(frontmatter.release_tracking_status, "unconfigured");
    assert.equal(frontmatter.release_tracking_ref, "series-1");
    assert.equal(frontmatter.latest_chapter, "147");
  });
});
