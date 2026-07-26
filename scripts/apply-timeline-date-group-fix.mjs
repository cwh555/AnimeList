import { readFileSync, writeFileSync } from "node:fs";

function replaceOrThrow(path, before, after) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Expected source block not found in ${path}:\n${before}`);
  }
  writeFileSync(path, source.replace(before, after));
}

replaceOrThrow(
  "src/legacy.ts",
  `import {
  centerLatestTimelineAxis,
  layoutDefaultTimelinePoints,
} from "./timeline-corrections";`,
  `import { centerLatestTimelineAxis } from "./timeline-corrections";`,
);

replaceOrThrow(
  "src/legacy.ts",
  `      latestItemCenterX: 0,
      useDefaultStackLimit: true,
`,
  `      latestItemCenterX: 0,
`,
);

replaceOrThrow(
  "src/legacy.ts",
  `      const laidOutItems = state.useDefaultStackLimit
        ? layoutDefaultTimelinePoints(
          positionedItems.map((positioned) => positioned.x),
          CARD_WIDTH + CARD_GAP_X,
          adapters.maxStackDepth,
        ).map((placement, index) => ({
          ...positionedItems[index],
          anchorX: placement.anchorX,
          x: placement.x,
          lane: placement.lane,
        }))
        : assignTimelineLanes(positionedItems, CARD_WIDTH + CARD_GAP_X)
          .map((positioned) => ({ ...positioned, anchorX: positioned.x }));
      const maximumCardX = Math.max(...laidOutItems.map((positioned) => positioned.x));
      state.sceneWidth = Math.max(state.sceneWidth, maximumCardX + sidePadding);
`,
  `      const laidOutItems = assignTimelineLanes(
        positionedItems,
        CARD_WIDTH + CARD_GAP_X,
      );
`,
);

replaceOrThrow(
  "src/legacy.ts",
  `      laidOutItems.forEach(({ item, time, x, anchorX, lane }, index) => {
        const level = Math.floor(lane / 2);
        const aboveAxis = lane % 2 === 0;
        const cardY = aboveAxis
          ? axisY - STEM_GAP - CARD_HEIGHT - level * (CARD_HEIGHT + CARD_GAP_Y)
          : axisY + STEM_GAP + level * (CARD_HEIGHT + CARD_GAP_Y);
        if (Math.abs(x - anchorX) >= 0.5) {
          const dateLink = makeEl("div", "al-timeline-axis al-timeline-date-link");
          dateLink.style.left = String(Math.min(anchorX, x)) + "px";
          dateLink.style.top = String(axisY) + "px";
          dateLink.style.width = String(Math.abs(x - anchorX)) + "px";
          scene.appendChild(dateLink);
        }
`,
  `      laidOutItems.forEach(({ item, time, x, lane }, index) => {
        const level = Math.floor(lane / 2);
        const aboveAxis = lane % 2 === 0;
        const cardY = aboveAxis
          ? axisY - STEM_GAP - CARD_HEIGHT - level * (CARD_HEIGHT + CARD_GAP_Y)
          : axisY + STEM_GAP + level * (CARD_HEIGHT + CARD_GAP_Y);
`,
);

replaceOrThrow(
  "src/legacy.ts",
  `      state.useDefaultStackLimit = false;
      state.daySpacing = next;
`,
  `      state.daySpacing = next;
`,
);

replaceOrThrow(
  "src/legacy.ts",
  `    const resetView = () => {
      state.useDefaultStackLimit = true;
      state.daySpacing = defaultView.daySpacing;
`,
  `    const resetView = () => {
      state.daySpacing = defaultView.daySpacing;
`,
);

replaceOrThrow(
  "src/legacy.ts",
  `    const fitScene = () => {
      state.useDefaultStackLimit = false;
      const availableWidth = Math.max(260, viewport.clientWidth / state.viewScale - sidePadding * 2);
`,
  `    const fitScene = () => {
      const availableWidth = Math.max(260, viewport.clientWidth / state.viewScale - sidePadding * 2);
`,
);

writeFileSync(
  "src/timeline-corrections.ts",
  `import {
  progressUnitFeatureText,
  progressUnitLabel,
} from "./progress-unit-feature-text";
import type { ReadingProgressUnit } from "./progress-units";

export interface TimelinePan {
  x: number;
  y: number;
}

export interface TimelineEntryCopy {
  title: string;
  label: string;
}

/** Centers the newest card horizontally while keeping the timeline axis vertical center. */
export function centerLatestTimelineAxis(
  viewportWidth: number,
  viewportHeight: number,
  latestCardCenterX: number,
  axisY: number,
  viewScale: number,
): TimelinePan {
  return {
    x: viewportWidth / 2 - latestCardCenterX * viewScale,
    y: viewportHeight / 2 - axisY * viewScale,
  };
}

export function timelineEntryCopy(
  seriesTitle: string,
  entryLabel: string,
  unit: ReadingProgressUnit,
): TimelineEntryCopy {
  const unitLabel = progressUnitLabel(unit);
  return {
    title: progressUnitFeatureText("timelineEntryTitle", {
      title: seriesTitle,
      label: entryLabel,
      unit: unitLabel,
    }),
    label: progressUnitFeatureText("timelineEntryLabel", {
      label: entryLabel,
      unit: unitLabel,
    }),
  };
}
`,
);

writeFileSync(
  "tests/timeline-corrections.test.ts",
  `import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandTimelineEntries } from "../src/novel-progress";
import type { MediaItem } from "../src/types";
import {
  centerLatestTimelineAxis,
  timelineEntryCopy,
} from "../src/timeline-corrections";

describe("timeline default centering correction", () => {
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
`,
);

replaceOrThrow(
  "tests/timeline-scale.test.ts",
  `  it("documents same-day overflow as the only spacing-independent exception", () => {
    const times = Array.from({ length: 7 }, () => 0);
    const spacing = calculateDefaultTimelineDaySpacing(times, 1000, 3);
    const points = times.map((time) => (time / DAY_MS) * spacing);

    assert.equal(laneCount(points, MINIMUM_CARD_DISTANCE), 7);
  });
`,
  `  it("documents same-day overflow as the only spacing-independent exception", () => {
    const times = Array.from({ length: 7 }, () => 0);
    const spacing = calculateDefaultTimelineDaySpacing(times, 1000, 3);
    const points = times.map((time) => (time / DAY_MS) * spacing);

    assert.equal(laneCount(points, MINIMUM_CARD_DISTANCE), 7);
  });

  it("separates neighboring date groups without flattening same-day overflow", () => {
    const times = [
      ...Array.from({ length: 10 }, () => 0),
      ...Array.from({ length: 3 }, () => DAY_MS),
    ];
    const spacing = calculateDefaultTimelineDaySpacing(times, 1, 3);
    const points = times.map((time) => (time / DAY_MS) * spacing);

    assert.ok(spacing >= MINIMUM_CARD_DISTANCE);
    assert.equal(laneCount(points, MINIMUM_CARD_DISTANCE), 10);
  });
`,
);

replaceOrThrow(
  "tests/timeline-scale.test.ts",
  `  it("caps same-day records at the configured default stack depth", () => {
    installFakeDom();
    const container = new FakeElement("div");
    const items = Array.from({ length: 14 }, (_, index) => ({
      ...timelineItem(index),
      completedAt: "2026-07-01",
    }));

    legacyTest.TimelineUI.render(container, items, { maxStackDepth: 3 });

    const lanes = descendantsByClass(container, "al-timeline-card")
      .map((card) => Number(card.dataset.timelineLane));
    assert.equal(Math.max(...lanes), 5);
  });
`,
  `  it("keeps same-day records stacked and separates the next date group", () => {
    installFakeDom();
    const container = new FakeElement("div");
    const firstDay = Array.from({ length: 10 }, (_, index) => ({
      ...timelineItem(index),
      title: \`First day \${index}\`,
      completedAt: "2026-01-01",
    }));
    const secondDay = Array.from({ length: 3 }, (_, index) => ({
      ...timelineItem(index + 10),
      title: \`Second day \${index}\`,
      completedAt: "2026-01-02",
    }));

    legacyTest.TimelineUI.render(container, [...firstDay, ...secondDay], {
      maxStackDepth: 3,
    });

    const cards = descendantsByClass(container, "al-timeline-card");
    const firstDayCards = cards.filter((card) => card.title.includes("2026-01-01"));
    const secondDayCards = cards.filter((card) => card.title.includes("2026-01-02"));
    const firstDayLanes = firstDayCards.map((card) => Number(card.dataset.timelineLane));
    const secondDayLanes = secondDayCards.map((card) => Number(card.dataset.timelineLane));
    const firstDayX = Number.parseFloat(firstDayCards[0].style.left) + 60;
    const secondDayX = Number.parseFloat(secondDayCards[0].style.left) + 60;

    assert.equal(Math.max(...firstDayLanes), 9);
    assert.deepEqual(secondDayLanes, [0, 1, 2]);
    assert.ok(secondDayX - firstDayX >= MINIMUM_CARD_DISTANCE);
    assert.equal(Math.max(...cards.map((card) => Number(card.dataset.timelineLane))), 9);
  });
`,
);
