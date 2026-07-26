import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateDefaultTimelineDaySpacing,
  calculateTimelineLaneCount,
  timelineLayoutRespectsInitialStackDepth,
} from "../src/timeline-scale";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINIMUM_CARD_DISTANCE = 136;

function assignLanes(points: readonly number[]): number[] {
  const laneEnds: number[] = [];
  return points.map((point) => {
    let lane = laneEnds.findIndex(
      (lastPoint) => point - lastPoint >= MINIMUM_CARD_DISTANCE,
    );
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = point;
    return lane;
  });
}

describe("timeline work-level density", () => {
  it("keeps a later-date work from extending an unavoidable same-day stack", () => {
    const times = [0, 0, 0, 0, 0, DAY_MS];
    const spacing = calculateDefaultTimelineDaySpacing(times, 1000, 1);
    const lanes = assignLanes(
      times.map((time) => (time / DAY_MS) * spacing),
    );

    assert.equal(Math.max(...lanes) + 1, 5);
    assert.equal(lanes.at(-1), 0);
    assert.equal(timelineLayoutRespectsInitialStackDepth(times, spacing, 1), true);
  });

  it("counts every work when separating neighboring date groups", () => {
    const times = [0, 0, 0, DAY_MS, DAY_MS, 2 * DAY_MS];
    const spacing = calculateDefaultTimelineDaySpacing(times, 1000, 1);
    const lanes = assignLanes(
      times.map((time) => (time / DAY_MS) * spacing),
    );

    assert.equal(Math.max(...lanes) + 1, 3);
    assert.deepEqual(lanes, [0, 1, 2, 0, 1, 0]);
  });

  it("validates the actual initialized lanes for a dense mixed-date timeline", () => {
    const dayCounts = [1, 1, 2, 1, 3, 2, 4, 2, 3, 1, 4, 2, 3, 1, 2, 1, 3, 2, 1, 2, 1, 1, 2, 1];
    const times = dayCounts.flatMap((count, day) => (
      Array.from({ length: count }, () => day * 2 * DAY_MS)
    ));
    const rangeDays = (dayCounts.length - 1) * 2;
    const spacing = calculateDefaultTimelineDaySpacing(times, rangeDays, 3);

    assert.ok(spacing > 0);
    assert.ok(calculateTimelineLaneCount(times, spacing) <= 6);
    assert.equal(timelineLayoutRespectsInitialStackDepth(times, spacing, 3), true);
  });

  it("does not let a distant same-day overflow relax other date groups", () => {
    const denseDates = Array.from({ length: 11 }, (_, day) => (
      [day * DAY_MS, day * DAY_MS]
    )).flat();
    const distantSameDayOverflow = Array.from({ length: 10 }, () => 1000 * DAY_MS);
    const times = [...denseDates, ...distantSameDayOverflow];

    assert.equal(timelineLayoutRespectsInitialStackDepth(times, 28, 3), false);

    const spacing = calculateDefaultTimelineDaySpacing(times, 1000, 3);
    assert.equal(timelineLayoutRespectsInitialStackDepth(times, spacing, 3), true);
    assert.equal(calculateTimelineLaneCount(times, spacing), 10);
  });
});
