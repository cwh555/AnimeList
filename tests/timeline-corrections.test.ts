import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
});
