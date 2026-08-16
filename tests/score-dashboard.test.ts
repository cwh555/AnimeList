import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScoreDashboardData,
  normalizeScoreDashboardScale,
  scoreDashboardPosterMetrics,
  scoreDashboardScores,
} from "../src/domain/score-dashboard/model";
import {
  planScoreDashboardMove,
  planScoreDashboardShift,
  scoreDashboardPlanNeedsClampConfirmation,
} from "../src/domain/score-dashboard/move";
import { applyScoreDashboardFrontmatter } from "../src/data/score-dashboard/score-service";
import { visibleScoreDashboardPaths } from "../src/ui/score-dashboard/renderer";
import {
  preserveScoreDashboardAnchorScrollTop,
  scoreDashboardScaleFromWheel,
  scoreDashboardWheelIntent,
} from "../src/domain/score-dashboard/gesture";
import type { MediaItem, MediaType } from "../src/types";

function item(title: string, score: number | null, mediaType: MediaType = "anime"): MediaItem {
  return {
    title,
    originalTitle: "",
    mediaType,
    format: "",
    status: "completed",
    releaseStatus: "finished",
    progress: 0,
    total: 0,
    unit: "",
    score,
    favorite: false,
    year: "",
    genres: [],
    people: [],
    platforms: [],
    sourceUrls: [],
    cover: "",
    filePath: `${title}.md`,
    updated: 0,
    updatedLabel: "",
    startedAt: "",
    completedAt: "",
    volumeLog: [],
  };
}

describe("score dashboard model", () => {
  it("creates all 21 half-point lanes in descending order", () => {
    const scores = scoreDashboardScores();
    assert.equal(scores.length, 21);
    assert.equal(scores[0], 10);
    assert.equal(scores.at(-1), 0);
  });

  it("groups 10 alone and other integer bands with their half-point lane", () => {
    const data = buildScoreDashboardData([item("A", 10), item("B", 9.5), item("C", 9)]);
    assert.deepEqual(data.groups[0].lanes.map((lane) => lane.score), [10]);
    assert.deepEqual(data.groups[1].lanes.map((lane) => lane.score), [9.5, 9]);
    assert.equal(data.groups[1].itemCount, 2);
  });

  it("rounds legacy scores for display without changing source items", () => {
    const legacy = item("Legacy", 8.7);
    const data = buildScoreDashboardData([legacy]);
    assert.equal(data.groups.find((group) => group.major === 8)?.lanes[0].items[0], legacy);
    assert.equal(legacy.score, 8.7);
  });

  it("keeps score zero separate from unrated", () => {
    const data = buildScoreDashboardData([item("Zero", 0), item("None", null)]);
    assert.equal(data.groups.at(-1)?.lanes[1].items[0].title, "Zero");
    assert.equal(data.unrated[0].title, "None");
  });

  it("filters by media type before counting", () => {
    const data = buildScoreDashboardData([item("Anime", 9, "anime"), item("Manga", 8, "manga")], "manga");
    assert.equal(data.total, 1);
    assert.equal(data.rated, 1);
  });

  it("clamps and snaps slider zoom values from 20 to 200 percent", () => {
    assert.equal(normalizeScoreDashboardScale(1), 20);
    assert.equal(normalizeScoreDashboardScale(20), 20);
    assert.equal(normalizeScoreDashboardScale(23), 25);
    assert.equal(normalizeScoreDashboardScale(113), 115);
    assert.equal(normalizeScoreDashboardScale(999), 200);
  });

  it("keeps continuous gesture scale when calculating poster metrics", () => {
    const metrics = scoreDashboardPosterMetrics(101.5);
    assert.equal(metrics.scale, 101.5);
    assert.ok(Math.abs(metrics.posterWidth - 73.5875) < 1e-9);
  });
});

describe("score dashboard score moves", () => {
  it("moves rated or unrated items directly to a target score", () => {
    const plan = planScoreDashboardMove([
      { filePath: "rated.md", score: 8 },
      { filePath: "unrated.md", score: null },
    ], 9.5);
    assert.deepEqual(plan.changes.map((change) => change.nextScore), [9.5, 9.5]);
    assert.equal(plan.blockedUnratedPaths.length, 0);
  });

  it("allows moving a rated item back to unrated", () => {
    const plan = planScoreDashboardMove([{ filePath: "rated.md", score: 8 }], null);
    assert.equal(plan.changes[0].nextScore, null);
  });

  it("blocks the entire shift when any selected item is unrated", () => {
    const plan = planScoreDashboardShift([
      { filePath: "rated.md", score: 8 },
      { filePath: "unrated.md", score: null },
    ], 1);
    assert.equal(plan.changes.length, 0);
    assert.deepEqual(plan.blockedUnratedPaths, ["unrated.md"]);
  });

  it("shifts by half a point and reports values that need clamping", () => {
    const up = planScoreDashboardShift([
      { filePath: "nine.md", score: 9 },
      { filePath: "ten.md", score: 10 },
    ], 1);
    assert.deepEqual(up.changes.map((change) => change.nextScore), [9.5, 10]);
    assert.deepEqual(up.clampedHighPaths, ["ten.md"]);
    assert.equal(scoreDashboardPlanNeedsClampConfirmation(up), true);

    const down = planScoreDashboardShift([{ filePath: "zero.md", score: 0 }], -1);
    assert.equal(down.changes[0].nextScore, 0);
    assert.deepEqual(down.clampedLowPaths, ["zero.md"]);
  });

  it("removes only score and update timestamps when moving to unrated", () => {
    const frontmatter: Record<string, unknown> = {
      title: "Keep me",
      score: 8,
      favorite: true,
      updated_at: "old",
      metadata_updated_at: "old",
    };
    applyScoreDashboardFrontmatter(frontmatter, null);
    assert.deepEqual(frontmatter, { title: "Keep me", favorite: true });
  });

  it("selects only currently displayed items for batch select all", () => {
    const items = [item("Anime", 8, "anime"), item("Hidden unrated", null, "anime"), item("Manga", 7, "manga")];
    assert.deepEqual(visibleScoreDashboardPaths(items, "anime", false), ["Anime.md"]);
    assert.deepEqual(visibleScoreDashboardPaths(items, "anime", true), ["Anime.md", "Hidden unrated.md"]);
  });
});

describe("score dashboard gestures", () => {
  it("leaves ordinary wheel input as native scrolling", () => {
    assert.equal(scoreDashboardWheelIntent({ ctrlKey: false }), "scroll");
  });

  it("uses ctrl-modified wheel input for pinch or ctrl-wheel zoom", () => {
    assert.equal(scoreDashboardWheelIntent({ ctrlKey: true }), "zoom");
  });

  it("accumulates smooth wheel zoom without five-percent snapping", () => {
    const zoomedIn = scoreDashboardScaleFromWheel(100, -10, 20, 200);
    const zoomedOut = scoreDashboardScaleFromWheel(100, 10, 20, 200);
    assert.ok(zoomedIn > 100 && zoomedIn < 105);
    assert.ok(zoomedOut < 100 && zoomedOut > 95);
  });

  it("clamps gesture zoom to the supported range", () => {
    assert.equal(scoreDashboardScaleFromWheel(199, -1000, 20, 200), 200);
    assert.equal(scoreDashboardScaleFromWheel(21, 1000, 20, 200), 20);
  });

  it("preserves the same visual anchor after layout reflow", () => {
    assert.equal(preserveScoreDashboardAnchorScrollTop(400, 240, 300), 460);
    assert.equal(preserveScoreDashboardAnchorScrollTop(20, 100, 40), 0);
  });
});
