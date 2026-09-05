import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTimelineActivityCurve,
  buildTimelineDensityCurve,
  groupTimelineHistory,
  timelineTimeForX,
  timelineXForTime,
  TIMELINE_ACTIVITY_WINDOW_DAYS,
  TIMELINE_ACTIVITY_WINDOW_MS,
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

  it("uses a fixed 14-day compact-support window for local activity", () => {
    const minimum = new Date(2026, 0, 1).getTime();
    const times = [0, 60].map((day) => minimum + day * DAY);
    const curve = buildTimelineActivityCurve(times, minimum, minimum + 60 * DAY);

    assert.equal(TIMELINE_ACTIVITY_WINDOW_DAYS, 14);
    assert.equal(curve.windowMs, TIMELINE_ACTIVITY_WINDOW_MS);
    assert.equal(curve.bandwidthMs, TIMELINE_ACTIVITY_WINDOW_MS);

    const middle = curve.points.filter((point) => (
      point.time >= minimum + 20 * DAY && point.time <= minimum + 40 * DAY
    ));
    assert.ok(middle.length > 0);
    assert.ok(middle.every((point) => point.density === 0));
  });

  it("keeps a short dense burst visibly higher than isolated completions", () => {
    const minimum = new Date(2026, 0, 1).getTime();
    const burstDay = minimum + 101 * DAY;
    const times = [
      minimum,
      minimum + 100 * DAY,
      burstDay,
      burstDay,
      minimum + 102 * DAY,
      minimum + 365 * DAY,
      minimum + 730 * DAY,
    ];
    const curve = buildTimelineActivityCurve(times, minimum, minimum + 730 * DAY);
    const burst = curve.points.find((point) => point.time === burstDay);
    const isolated = curve.points.find((point) => point.time === minimum + 365 * DAY);

    assert.ok(burst);
    assert.ok(isolated);
    assert.ok(
      burst.density > isolated.density * 3,
      `expected burst=${burst.density} to dominate isolated=${isolated.density}`,
    );
  });

  it("samples at least daily across ordinary histories even when fewer points are requested", () => {
    const minimum = new Date(2026, 0, 1).getTime();
    const maximum = minimum + 365 * DAY;
    const curve = buildTimelineActivityCurve([minimum, maximum], minimum, maximum, 32);

    assert.ok(curve.points.length >= 366, `expected daily sampling, got ${curve.points.length} points`);
    const maximumStep = Math.max(
      ...curve.points.slice(1).map((point, index) => point.time - curve.points[index].time),
    );
    assert.ok(maximumStep <= DAY, `expected <= 1 day sampling, got ${maximumStep / DAY} days`);
  });

  it("always samples exact completion dates when very long histories exceed the uniform cap", () => {
    const minimum = new Date(1990, 0, 1).getTime();
    const burstDay = minimum + 4321 * DAY;
    const maximum = minimum + 10000 * DAY;
    const curve = buildTimelineActivityCurve([minimum, burstDay, burstDay, maximum], minimum, maximum);
    const burst = curve.points.find((point) => point.time === burstDay);

    assert.ok(burst, "expected exact burst date to be included in the overview samples");
    assert.ok(burst.density >= 2, `expected duplicate completion weight at burst, got ${burst.density}`);
  });

  it("keeps the existing density-curve entry point as an activity-curve compatibility alias", () => {
    const minimum = new Date(2026, 0, 1).getTime();
    const times = [minimum, minimum + DAY, minimum + 2 * DAY];
    const activity = buildTimelineActivityCurve(times, minimum, minimum + 2 * DAY, 16);
    const compatibility = buildTimelineDensityCurve(times, minimum, minimum + 2 * DAY, 16);
    assert.deepEqual(compatibility, activity);
  });

  it("orders same-day installments newest-first inside each work", () => {
    const completedTime = new Date(2026, 5, 6).getTime();
    const items = [
      { title: "作品 第一季", completedTime },
      { title: "作品 第十季", completedTime },
      { title: "作品 第二季", completedTime },
      { title: "作品 外傳", completedTime },
    ];
    const grouped = groupTimelineHistory(items);
    assert.deepEqual(
      grouped[0].months[0].items.map((item) => item.title),
      ["作品 第十季", "作品 第二季", "作品 第一季", "作品 外傳"],
    );

    const volumes = [
      { title: "小說 — 第 3 卷", seriesTitle: "小說", volumeLabel: "3", completedTime },
      { title: "小說 — 第 10 卷", seriesTitle: "小說", volumeLabel: "10", completedTime },
      { title: "小說 — 第 4 卷", seriesTitle: "小說", volumeLabel: "4", completedTime },
    ];
    const volumeGroup = groupTimelineHistory(volumes);
    assert.deepEqual(
      volumeGroup[0].months[0].items.map((item) => item.volumeLabel),
      ["10", "4", "3"],
    );
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
