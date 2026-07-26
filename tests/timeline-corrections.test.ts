import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandTimelineEntries } from "../src/novel-progress";
import type { MediaItem } from "../src/types";
import {
  centerLatestTimelineAxis,
  timelineEntryCopy,
} from "../src/timeline-corrections";
import { calculateDefaultTimelineDaySpacing } from "../src/timeline-scale";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINIMUM_CARD_DISTANCE = 136;

function laneCount(points: readonly number[], minimumDistance: number): number {
  const laneEnds: number[] = [];
  for (const point of points) {
    let lane = laneEnds.findIndex((lastPoint) => point - lastPoint >= minimumDistance);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = point;
  }
  return laneEnds.length;
}

describe("timeline default spacing capacity", () => {
  it("allows a sixth overlapping work within three lanes per side", () => {
    const baseline = calculateDefaultTimelineDaySpacing([0, DAY_MS], 1, 3);
    const times = [
      ...Array.from({ length: 5 }, () => 0),
      DAY_MS,
    ];
    const spacing = calculateDefaultTimelineDaySpacing(times, 1, 3);
    const points = times.map((time) => (time / DAY_MS) * spacing);

    assert.equal(spacing, baseline);
    assert.equal(laneCount(points, MINIMUM_CARD_DISTANCE), 6);
  });

  it("separates the next date when overlap would require a seventh lane", () => {
    const baseline = calculateDefaultTimelineDaySpacing([0, DAY_MS], 1, 3);
    const times = [
      ...Array.from({ length: 5 }, () => 0),
      DAY_MS,
      DAY_MS,
    ];
    const spacing = calculateDefaultTimelineDaySpacing(times, 1, 3);
    const points = times.map((time) => (time / DAY_MS) * spacing);

    assert.ok(spacing > baseline);
    assert.ok(spacing >= MINIMUM_CARD_DISTANCE);
    assert.equal(laneCount(points, MINIMUM_CARD_DISTANCE), 5);
  });

  it("separates a later date from an unavoidable ten-work same-day stack", () => {
    const times = [
      ...Array.from({ length: 10 }, () => 0),
      DAY_MS,
    ];
    const spacing = calculateDefaultTimelineDaySpacing(times, 1, 3);
    const points = times.map((time) => (time / DAY_MS) * spacing);

    assert.ok(spacing >= MINIMUM_CARD_DISTANCE);
    assert.equal(laneCount(points, MINIMUM_CARD_DISTANCE), 10);
  });

  it("does not let distant same-day overflow relax another dense region", () => {
    const denseRegion = Array.from(
      { length: 7 },
      (_, index) => (200 + index) * DAY_MS,
    );
    const times = [
      ...Array.from({ length: 10 }, () => 0),
      ...denseRegion,
    ];
    const spacing = calculateDefaultTimelineDaySpacing(times, 206, 3);
    const densePoints = denseRegion.map((time) => (time / DAY_MS) * spacing);

    assert.ok(spacing > 6);
    assert.ok(laneCount(densePoints, MINIMUM_CARD_DISTANCE) <= 6);
  });
});

describe("timeline default centering correction", () => {
  it("centers the newest card on x and the timeline axis on y", () => {
    assert.deepEqual(
      centerLatestTimelineAxis(1200, 800, 950, 464, 0.5),
      { x: 125, y: 168 },
    );
    assert.deepEqual(
      centerLatestTimelineAxis(1200, 800, 950, 200, 0.5),
      { x: 125, y: 300 },
    );
  });
});

describe("timeline serial-entry units", () => {
  it("renders chapter, season, and volume labels from the stored unit", () => {
    assert.deepEqual(timelineEntryCopy("漫畫", "12", "chapter"), {
      title: "漫畫 — 第 12 話",
      label: "第 12 話",
    });
    assert.deepEqual(timelineEntryCopy("小說", "2", "season"), {
      title: "小說 — 第 2 季",
      label: "第 2 季",
    });
    assert.deepEqual(timelineEntryCopy("小說", "7.5", "volume"), {
      title: "小說 — 第 7.5 卷",
      label: "第 7.5 卷",
    });
  });

  it("expands manga and novel entries with their stored unit", () => {
    const base: MediaItem = {
      title: "作品",
      originalTitle: "",
      mediaType: "manga",
      format: "manga",
      status: "ongoing",
      releaseStatus: "releasing",
      progress: 1,
      total: 0,
      unit: "chapter",
      score: null,
      favorite: false,
      year: 2026,
      genres: [],
      people: [],
      platforms: [],
      sourceUrls: [],
      cover: "series.jpg",
      filePath: "Media/example.md",
      updated: 0,
      updatedLabel: "",
      startedAt: "",
      completedAt: "",
      volumeLog: [{ label: "12", startedAt: "", completedAt: "2026-07-01" }],
    };
    const chapter = expandTimelineEntries([base])[0];
    const season = expandTimelineEntries([{ ...base, mediaType: "novel", unit: "season" }])[0];
    const volume = expandTimelineEntries([{ ...base, mediaType: "novel", unit: "volume" }])[0];

    assert.equal(chapter.title, "作品 — 第 12 話");
    assert.equal(chapter.serialEntryLabel, "第 12 話");
    assert.equal(season.title, "作品 — 第 12 季");
    assert.equal(season.serialEntryLabel, "第 12 季");
    assert.equal(volume.title, "作品 — 第 12 卷");
    assert.equal(volume.serialEntryLabel, "第 12 卷");
  });
});
