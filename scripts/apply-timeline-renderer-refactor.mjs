import fs from "node:fs";

function replaceOrThrow(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Expected source block was not found in ${path}:\n${before.slice(0, 240)}`);
  }
  fs.writeFileSync(path, source.replace(before, after), "utf8");
}

replaceOrThrow(
  "src/plugin-entry.ts",
  'import { installTimelineCorrections } from "./timeline-correction-ui";\n',
  "",
);
replaceOrThrow(
  "src/plugin-entry.ts",
  "    installTimelineCorrections(this);\n",
  "",
);

replaceOrThrow(
  "src/novel-progress.ts",
  'import { uiText } from "./ui-text";\n',
  'import { defaultProgressUnit } from "./progress-units";\nimport { timelineEntryCopy } from "./timeline-corrections";\n',
);
replaceOrThrow(
  "src/novel-progress.ts",
  `export function expandTimelineEntries(items: MediaItem[]): TimelineMediaEntry[] {
  const output: TimelineMediaEntry[] = [];
  for (const item of items) {
    const completedVolumes = item.mediaType === "novel" || item.mediaType === "manga" ? normalizeVolumeLog(item.volumeLog).filter((entry) => Boolean(entry.completedAt)) : [];
    if (completedVolumes.length) {
      for (const volume of completedVolumes) output.push({ ...item, seriesTitle: item.title, title: uiText("timeline.novelEventTitle", { title: item.title, volume: volume.label }), completedAt: volume.completedAt, cover: volume.cover || item.cover, volumeLabel: volume.label });
      continue;
    }
    if (item.status === "completed" && item.completedAt) output.push({ ...item });
  }
  return output;
}
`,
  `export function expandTimelineEntries(items: MediaItem[]): TimelineMediaEntry[] {
  const output: TimelineMediaEntry[] = [];
  for (const item of items) {
    const completedVolumes = item.mediaType === "novel" || item.mediaType === "manga" ? normalizeVolumeLog(item.volumeLog).filter((entry) => Boolean(entry.completedAt)) : [];
    if (completedVolumes.length) {
      for (const volume of completedVolumes) {
        const unit = defaultProgressUnit(item.mediaType, item.unit);
        const copy = timelineEntryCopy(
          item.title,
          volume.label,
          unit === "episode" ? "volume" : unit,
        );
        output.push({
          ...item,
          seriesTitle: item.title,
          title: copy.title,
          serialEntryLabel: copy.label,
          completedAt: volume.completedAt,
          cover: volume.cover || item.cover,
          volumeLabel: volume.label,
        });
      }
      continue;
    }
    if (item.status === "completed" && item.completedAt) output.push({ ...item });
  }
  return output;
}
`,
);

replaceOrThrow(
  "src/types.ts",
  "export interface TimelineMediaEntry extends MediaItem { seriesTitle?: string; volumeLabel?: string; }",
  "export interface TimelineMediaEntry extends MediaItem { seriesTitle?: string; volumeLabel?: string; serialEntryLabel?: string; }",
);

replaceOrThrow(
  "src/legacy.ts",
  `import {
  MAX_TIMELINE_DAY_SPACING,
  MAX_TIMELINE_VIEW_SCALE,
  MIN_TIMELINE_DAY_SPACING,
  MIN_TIMELINE_VIEW_SCALE,
  calculateDefaultTimelineView,
  centerTimelinePoint,
  normalizeTimelineMaxStackDepth,
  preserveTimelineAxisScreenY,
} from "./timeline-scale";
`,
  `import {
  MAX_TIMELINE_DAY_SPACING,
  MAX_TIMELINE_VIEW_SCALE,
  MIN_TIMELINE_DAY_SPACING,
  MIN_TIMELINE_VIEW_SCALE,
  calculateDefaultTimelineView,
  centerTimelinePoint,
  normalizeTimelineMaxStackDepth,
  preserveTimelineAxisScreenY,
} from "./timeline-scale";
import {
  centerLatestTimelineAxis,
  layoutDefaultTimelinePoints,
} from "./timeline-corrections";
`,
);
replaceOrThrow(
  "src/legacy.ts",
  `      axisY: 0,
      latestItemCenterX: 0,
      latestItemCenterY: 0,
`,
  `      axisY: 0,
      latestItemCenterX: 0,
      useDefaultStackLimit: true,
`,
);
replaceOrThrow(
  "src/legacy.ts",
  `      const positionedItems = items.map((item) => ({
        item,
        time: item.completedTime,
        x: sidePadding + Math.round((item.completedTime - minTime) / DAY_MS) * state.daySpacing,
      }));
      const laidOutItems = assignTimelineLanes(positionedItems, CARD_WIDTH + CARD_GAP_X);
      const laneCount = Math.max(1, ...laidOutItems.map((positioned) => positioned.lane + 1));
`,
  `      const positionedItems = items.map((item) => ({
        item,
        time: item.completedTime,
        x: sidePadding + Math.round((item.completedTime - minTime) / DAY_MS) * state.daySpacing,
      }));
      const laidOutItems = state.useDefaultStackLimit
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
      const laneCount = Math.max(1, ...laidOutItems.map((positioned) => positioned.lane + 1));
`,
);
replaceOrThrow(
  "src/legacy.ts",
  `      laidOutItems.forEach(({ item, time, x, lane }, index) => {
        const level = Math.floor(lane / 2);
        const aboveAxis = lane % 2 === 0;
        const cardY = aboveAxis
          ? axisY - STEM_GAP - CARD_HEIGHT - level * (CARD_HEIGHT + CARD_GAP_Y)
          : axisY + STEM_GAP + level * (CARD_HEIGHT + CARD_GAP_Y);
        const stemStart = aboveAxis ? cardY + CARD_HEIGHT : axisY;
`,
  `      laidOutItems.forEach(({ item, time, x, anchorX, lane }, index) => {
        const level = Math.floor(lane / 2);
        const aboveAxis = lane % 2 === 0;
        const cardY = aboveAxis
          ? axisY - STEM_GAP - CARD_HEIGHT - level * (CARD_HEIGHT + CARD_GAP_Y)
          : axisY + STEM_GAP + level * (CARD_HEIGHT + CARD_GAP_Y);
        if (Math.abs(x - anchorX) >= 0.5) {
          const dateLink = makeEl("div", "al-timeline-axis al-timeline-date-link");
          dateLink.style.left = \\`${Math.min(anchorX, x)}px\\`;
          dateLink.style.top = \\`${axisY}px\\`;
          dateLink.style.width = \\`${Math.abs(x - anchorX)}px\\`;
          scene.appendChild(dateLink);
        }
        const stemStart = aboveAxis ? cardY + CARD_HEIGHT : axisY;
`,
);
replaceOrThrow(
  "src/legacy.ts",
  `        if (item.volumeLabel) {
          text.appendChild(makeEl("span", "al-timeline-volume-label", uiText("timeline.volumeLabel", { volume: item.volumeLabel })));
        }
`,
  `        if (item.volumeLabel) {
          text.appendChild(makeEl("span", "al-timeline-volume-label", item.serialEntryLabel || uiText("timeline.volumeLabel", { volume: item.volumeLabel })));
        }
`,
);
replaceOrThrow(
  "src/legacy.ts",
  `        if (index === laidOutItems.length - 1) {
          state.latestItemCenterX = x;
          state.latestItemCenterY = cardY + CARD_HEIGHT / 2;
        }
`,
  `        if (index === laidOutItems.length - 1) state.latestItemCenterX = x;
`,
);
replaceOrThrow(
  "src/legacy.ts",
  `      state.daySpacing = next;
      renderGeometry();
`,
  `      state.useDefaultStackLimit = false;
      state.daySpacing = next;
      renderGeometry();
`,
);
replaceOrThrow(
  "src/legacy.ts",
  `    const centerLatestItem = () => {
      const pan = centerTimelinePoint(
        viewport.clientWidth,
        viewport.clientHeight,
        state.latestItemCenterX,
        state.latestItemCenterY,
        state.viewScale,
      );
      state.x = pan.x;
      state.y = pan.y;
      applyPan();
    };
`,
  `    const centerLatestItem = () => {
      const pan = centerLatestTimelineAxis(
        viewport.clientWidth,
        viewport.clientHeight,
        state.latestItemCenterX,
        state.axisY,
        state.viewScale,
      );
      state.x = pan.x;
      state.y = pan.y;
      applyPan();
    };
`,
);
replaceOrThrow(
  "src/legacy.ts",
  `    const resetView = () => {
      state.daySpacing = defaultView.daySpacing;
      state.viewScale = defaultView.viewScale;
`,
  `    const resetView = () => {
      state.useDefaultStackLimit = true;
      state.daySpacing = defaultView.daySpacing;
      state.viewScale = defaultView.viewScale;
`,
);
replaceOrThrow(
  "src/legacy.ts",
  `    const fitScene = () => {
      const availableWidth = Math.max(260, viewport.clientWidth / state.viewScale - sidePadding * 2);
`,
  `    const fitScene = () => {
      state.useDefaultStackLimit = false;
      const availableWidth = Math.max(260, viewport.clientWidth / state.viewScale - sidePadding * 2);
`,
);

replaceOrThrow(
  "tests/timeline-scale.test.ts",
  '  it("initializes and restores the latest timeline card at viewport center", () => {',
  '  it("centers the latest card horizontally and the timeline axis vertically", () => {',
);
replaceOrThrow(
  "tests/timeline-scale.test.ts",
  `    const initialCenter = screenCenter(latest, scene);
    assert.equal(initialCenter.x, viewport.clientWidth / 2);
    assert.equal(initialCenter.y, viewport.clientHeight / 2);

    descendantByAttribute(container, "aria-label", uiText("timeline.fit")).dispatch("click");
`,
  `    const initialCenter = screenCenter(latest, scene);
    const initialAxis = descendantsByClass(container, "al-timeline-axis")[0];
    const initialTransform = parseTransform(scene.style.transform);
    assert.equal(initialCenter.x, viewport.clientWidth / 2);
    assert.equal(
      initialTransform.y + Number.parseFloat(initialAxis.style.top) * initialTransform.scale,
      viewport.clientHeight / 2,
    );

    descendantByAttribute(container, "aria-label", uiText("timeline.fit")).dispatch("click");
`,
);
replaceOrThrow(
  "tests/timeline-scale.test.ts",
  `    const restoredLatest = descendantsByClass(container, "al-timeline-card")
      .find((card) => card.title.includes("Newest"));
    assert.ok(restoredLatest);
    const restoredCenter = screenCenter(restoredLatest, scene);
    assert.equal(restoredCenter.x, viewport.clientWidth / 2);
    assert.equal(restoredCenter.y, viewport.clientHeight / 2);
  });
`,
  `    const restoredLatest = descendantsByClass(container, "al-timeline-card")
      .find((card) => card.title.includes("Newest"));
    assert.ok(restoredLatest);
    const restoredCenter = screenCenter(restoredLatest, scene);
    const restoredAxis = descendantsByClass(container, "al-timeline-axis")[0];
    const restoredTransform = parseTransform(scene.style.transform);
    assert.equal(restoredCenter.x, viewport.clientWidth / 2);
    assert.equal(
      restoredTransform.y + Number.parseFloat(restoredAxis.style.top) * restoredTransform.scale,
      viewport.clientHeight / 2,
    );
  });
`,
);
replaceOrThrow(
  "tests/timeline-scale.test.ts",
  `  it("keeps the timeline axis at the same screen y while wheel-scaling time", () => {
`,
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

  it("keeps the timeline axis at the same screen y while wheel-scaling time", () => {
`,
);

replaceOrThrow(
  "tests/timeline-corrections.test.ts",
  'import { describe, it } from "node:test";\n',
  'import { describe, it } from "node:test";\nimport { expandTimelineEntries } from "../src/novel-progress";\nimport type { MediaItem } from "../src/types";\n',
);
replaceOrThrow(
  "tests/timeline-corrections.test.ts",
  `describe("timeline serial-entry units", () => {
  it("renders chapter, season, and volume labels from the stored unit", () => {
`,
  `describe("timeline serial-entry units", () => {
  it("renders chapter, season, and volume labels from the stored unit", () => {
`,
);
const unitIntegrationTest = `

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

    assert.equal(chapter.title, "作品 — 第 12 話");
    assert.equal(chapter.serialEntryLabel, "第 12 話");
    assert.equal(season.title, "作品 — 第 12 季");
    assert.equal(season.serialEntryLabel, "第 12 季");
  });
`;
const correctionsTest = fs.readFileSync("tests/timeline-corrections.test.ts", "utf8");
const finalClosing = "\n});\n";
const closingIndex = correctionsTest.lastIndexOf(finalClosing);
if (closingIndex < 0) throw new Error("Missing final timeline correction test closing block");
fs.writeFileSync(
  "tests/timeline-corrections.test.ts",
  `${correctionsTest.slice(0, closingIndex)}${unitIntegrationTest}${correctionsTest.slice(closingIndex)}`,
  "utf8",
);

for (const path of [
  "src/timeline-correction-ui.ts",
  ".github/workflows/timeline-diagnostics.yml",
  ".github/workflows/apply-timeline-renderer-refactor.yml",
  "scripts/apply-timeline-renderer-refactor.mjs",
]) {
  fs.rmSync(path, { force: true });
}
