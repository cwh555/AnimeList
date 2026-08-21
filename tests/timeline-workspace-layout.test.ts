import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTimelineDensity,
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

  it("accounts for every filtered completion event in density bins", () => {
    const minimum = new Date(2025, 0, 1).getTime();
    const times = [minimum, minimum + DAY, minimum + 2 * DAY, minimum + 90 * DAY];
    const bins = buildTimelineDensity(times, minimum, times.at(-1)!, 24);
    assert.equal(bins.reduce((sum, bin) => sum + bin.count, 0), times.length);
    assert.equal(bins[0].ratioStart, 0);
    assert.equal(bins.at(-1)!.ratioEnd, 1);
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
