import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandTimelineEntries } from "../src/novel-progress";
import type { MediaItem } from "../src/types";
import {
  centerLatestTimelineAxis,
  layoutDefaultTimelinePoints,
  timelineEntryCopy,
} from "../src/timeline-corrections";

const CARD_DISTANCE = 136;

describe("timeline default layout corrections", () => {
  it("keeps same-day overflow within the configured initial stack depth", () => {
    const placements = layoutDefaultTimelinePoints(
      Array.from({ length: 14 }, () => 300),
      CARD_DISTANCE,
      3,
    );

    assert.equal(Math.max(...placements.map((placement) => placement.lane)) + 1, 6);
    assert.deepEqual(
      placements.slice(0, 6).map((placement) => placement.x),
      [300, 300, 300, 300, 300, 300],
    );
    assert.ok(placements.every((placement) => placement.anchorX === 300));
    assert.ok(placements.slice(6).every((placement) => placement.x > placement.anchorX));
  });

  it("reuses only the configured lanes when nearby dates still collide", () => {
    const placements = layoutDefaultTimelinePoints(
      [0, 70, 140, 140],
      CARD_DISTANCE,
      1,
    );

    assert.deepEqual(placements.map((placement) => placement.lane), [0, 1, 0, 1]);
    assert.deepEqual(placements.map((placement) => placement.x), [0, 70, 140, 206]);
  });

  it("centers the newest card on x and the timeline axis on y", () => {
    assert.deepEqual(
      centerLatestTimelineAxis(1200, 800, 950, 464, 0.5),
      { x: 125, y: 168 },
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
