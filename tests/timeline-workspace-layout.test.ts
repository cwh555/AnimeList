import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTimelineDensityCurve,
  timelineAdaptiveDensitySamples,
  timelineDensityBandwidth,
  groupTimelineHistory,
  timelineTimeForX,
  timelineXForTime,
  TIMELINE_DAY_MS,
} from "../src/domain/timeline/layout";

const DAY = TIMELINE_DAY_MS;

describe("timeline workspace layout", () => {
  it("keeps screen distance proportional to real time", () => {
    const minimum = new Date(2026, 0, 1).getTime();
    const spacing = 12;
    const day1 = timelineXForTime(minimum + DAY, minimum, spacing, 64);
    const day2 = timelineXForTime(minimum + 2 * DAY, minimum, spacing, 64);
    const day30 = timelineXForTime(minimum + 30 * DAY, minimum, spacing, 64);
    assert.equal(day2 - day1, spacing);
    assert.equal((day30 - day1) / (day2 - day1), 29);
    assert.equal(timelineTimeForX(day30, minimum, spacing, 64), minimum + 30 * DAY);
  });

  it("builds a smooth adaptive Gaussian density curve instead of histogram bins", () => {
    const minimum = new Date(2025, 0, 1).getTime();
    const times = [minimum, minimum, minimum + DAY, minimum + 2 * DAY, minimum + 90 * DAY];
    const curve = buildTimelineDensityCurve(times, minimum, times.at(-1)!, 128);
    assert.equal(curve.points.length, 128);
    assert.equal(curve.points[0].ratio, 0);
    assert.equal(curve.points.at(-1)!.ratio, 1);
    assert.ok(curve.points.every((point) => Number.isFinite(point.density) && point.density >= 0));
    assert.ok(curve.bandwidthMs >= DAY);
    const peak = curve.points.reduce((best, point) => point.density > best.density ? point : best);
    assert.ok(peak.ratio < 0.2, `expected dense early cluster to dominate, got ratio ${peak.ratio}`);
  });


  it("uses narrower local bandwidth around dense bursts than isolated dates", () => {
    const minimum = new Date(2026, 0, 1).getTime();
    const times = [0, 1, 2, 3, 40, 120].map((day) => minimum + day * DAY);
    const samples = timelineAdaptiveDensitySamples(times);
    const dense = samples.find((sample) => sample.time === minimum + DAY)!;
    const isolated = samples.find((sample) => sample.time === minimum + 120 * DAY)!;
    assert.ok(dense.bandwidth < isolated.bandwidth, `${dense.bandwidth} should be less than ${isolated.bandwidth}`);
  });

  it("keeps a local cluster peak sharp even with a far-away completion", () => {
    const minimum = new Date(2026, 0, 1).getTime();
    const times = [0, 1, 2, 3, 120].map((day) => minimum + day * DAY);
    const curve = buildTimelineDensityCurve(times, minimum, minimum + 120 * DAY, 512);
    const nearCluster = curve.points.filter((point) => point.time <= minimum + 10 * DAY);
    const middle = curve.points.filter((point) => point.time >= minimum + 45 * DAY && point.time <= minimum + 75 * DAY);
    const clusterPeak = Math.max(...nearCluster.map((point) => point.density));
    const valley = Math.max(...middle.map((point) => point.density));
    assert.ok(clusterPeak > valley * 4, `expected a local peak, got peak=${clusterPeak} valley=${valley}`);
  });

  it("uses at least one day of density bandwidth for discrete completion dates", () => {
    const time = new Date(2026, 0, 1).getTime();
    assert.equal(timelineDensityBandwidth([time, time, time]), DAY);
  });

  it("groups history by descending year, month, and completion time", () => {
    const items = [
      { id: "a", completedTime: new Date(2025, 11, 1).getTime() },
      { id: "b", completedTime: new Date(2026, 0, 3).getTime() },
      { id: "c", completedTime: new Date(2026, 0, 8).getTime() },
      { id: "d", completedTime: new Date(2026, 5, 1).getTime() },
    ];
    const years = groupTimelineHistory(items);
    assert.deepEqual(years.map((year) => year.year), [2026, 2025]);
    assert.deepEqual(years[0].months.map((month) => month.month), [6, 1]);
    assert.deepEqual(years[0].months[1].items.map((item) => item.id), ["c", "b"]);
  });
});
