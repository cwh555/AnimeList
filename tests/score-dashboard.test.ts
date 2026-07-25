import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScoreDashboardData,
  normalizeScoreDashboardScale,
  scoreDashboardPosterMetrics,
  scoreDashboardScores,
} from "../src/score-dashboard-model";
import {
  preserveScoreDashboardAnchorScrollTop,
  scoreDashboardScaleFromWheel,
  scoreDashboardWheelIntent,
} from "../src/score-dashboard-gesture";
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
    const data = buildScoreDashboardData([
      item("Anime", 9, "anime"),
      item("Manga", 8, "manga"),
    ], "manga");
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

  it("uses the visual thumbnail footprint as the 100 percent baseline", () => {
    const normal = scoreDashboardPosterMetrics(100);
    assert.equal(normal.posterWidth, 72.5);
    assert.equal(normal.posterHeight, 108.75);
    assert.equal(normal.laneMinHeight, 118.75);
    assert.equal(normal.labelLayout, "regular");

    const small = scoreDashboardPosterMetrics(20);
    assert.equal(small.posterWidth, 14.5);
    assert.equal(small.posterHeight, 21.75);
    assert.equal(small.verticalMargin, 1);
    assert.equal(small.laneMinHeight, 23.75);
    assert.equal(small.labelLayout, "compact");

    const large = scoreDashboardPosterMetrics(200);
    assert.equal(large.posterWidth, 145);
    assert.equal(large.posterHeight, 217.5);
    assert.equal(large.verticalMargin, 10);
    assert.equal(large.laneMinHeight, 237.5);
    assert.equal(large.labelLayout, "regular");
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
