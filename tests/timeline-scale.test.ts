import assert from "node:assert/strict";
import { describe, it } from "node:test";
import AnimeListPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/settings";
import { legacyTest } from "../src/legacy";
import type { MediaItem } from "../src/types";
import { uiText } from "../src/ui-text";
import {
  DEFAULT_TIMELINE_MAX_STACK_DEPTH,
  MAX_TIMELINE_DAY_SPACING,
  MIN_TIMELINE_VIEW_SCALE,
  calculateDefaultTimelineDaySpacing,
  calculateDefaultTimelineView,
  centerTimelinePoint,
  normalizeTimelineMaxStackDepth,
  preserveTimelineAxisScreenY,
} from "../src/timeline-scale";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINIMUM_CARD_DISTANCE = 136;

function laneCount(points: number[], minimumDistance: number): number {
  const laneEnds: number[] = [];
  for (const point of points) {
    let lane = laneEnds.findIndex((lastPoint) => point - lastPoint >= minimumDistance);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = point;
  }
  return laneEnds.length;
}

describe("timeline scale defaults", () => {
  it("supports a 10 percent minimum scene scale", () => {
    assert.equal(MIN_TIMELINE_VIEW_SCALE, 0.1);
  });

  it("uses three card layers per side by default", () => {
    assert.equal(DEFAULT_TIMELINE_MAX_STACK_DEPTH, 3);
    assert.equal(DEFAULT_SETTINGS.timelineMaxStackDepth, 3);
  });

  it("normalizes saved stack-depth settings into the supported range", () => {
    assert.equal(normalizeTimelineMaxStackDepth(undefined), 3);
    assert.equal(normalizeTimelineMaxStackDepth(0), 1);
    assert.equal(normalizeTimelineMaxStackDepth(4.4), 4);
    assert.equal(normalizeTimelineMaxStackDepth(99), 10);
  });

  it("loads and normalizes the persisted setting with the rest of plugin settings", async () => {
    const plugin = Object.create(AnimeListPlugin.prototype) as AnimeListPlugin & {
      loadData: () => Promise<unknown>;
    };
    plugin.loadData = async () => ({ timelineMaxStackDepth: 5.4 });

    await plugin.loadSettings();

    assert.equal(plugin.settings.timelineMaxStackDepth, 5);
  });

  it("migrates legacy settings to the three-layer default", async () => {
    const plugin = Object.create(AnimeListPlugin.prototype) as AnimeListPlugin & {
      loadData: () => Promise<unknown>;
    };
    plugin.loadData = async () => ({});

    await plugin.loadSettings();

    assert.equal(plugin.settings.timelineMaxStackDepth, 3);
  });

  it("keeps the existing compact range baseline for sparse timelines", () => {
    const spacing = calculateDefaultTimelineDaySpacing(
      [0, 100 * DAY_MS],
      100,
      3,
    );
    assert.equal(spacing, 11);
  });

  it("uses one density calculation to keep separable records within six lanes", () => {
    const times = Array.from({ length: 7 }, (_, index) => index * DAY_MS);
    const spacing = calculateDefaultTimelineDaySpacing(times, 1000, 3);
    const points = times.map((time) => (time / DAY_MS) * spacing);

    assert.ok(spacing > 23.5 && spacing < 24);
    assert.ok(laneCount(points, MINIMUM_CARD_DISTANCE) <= 6);
  });

  it("ignores same-day duplicates when calculating distinct-date density", () => {
    const withDuplicates = [0, 0, 0, DAY_MS, 2 * DAY_MS];
    const distinctDates = [0, DAY_MS, 2 * DAY_MS];

    assert.equal(
      calculateDefaultTimelineDaySpacing(withDuplicates, 1000, 3),
      calculateDefaultTimelineDaySpacing(distinctDates, 1000, 3),
    );
  });

  it("uses the configured per-side depth for dense layouts", () => {
    const times = Array.from({ length: 5 }, (_, index) => index * DAY_MS);
    const spacing = calculateDefaultTimelineDaySpacing(times, 1000, 2);
    const points = times.map((time) => (time / DAY_MS) * spacing);

    assert.ok(laneCount(points, MINIMUM_CARD_DISTANCE) <= 4);
  });

  it("keeps distinct dates to one layer per side when configured to one", () => {
    const times = Array.from({ length: 9 }, (_, index) => index * DAY_MS);
    const spacing = calculateDefaultTimelineDaySpacing(times, 1000, 1);
    const points = times.map((time) => (time / DAY_MS) * spacing);

    assert.ok(spacing <= MAX_TIMELINE_DAY_SPACING);
    assert.ok(laneCount(points, MINIMUM_CARD_DISTANCE) <= 2);
  });

  it("documents same-day overflow as the only spacing-independent exception", () => {
    const times = Array.from({ length: 7 }, () => 0);
    const spacing = calculateDefaultTimelineDaySpacing(times, 1000, 3);
    const points = times.map((time) => (time / DAY_MS) * spacing);

    assert.equal(laneCount(points, MINIMUM_CARD_DISTANCE), 7);
  });

  it("preserves the timeline axis screen coordinate across horizontal scaling", () => {
    assert.equal(preserveTimelineAxisScreenY(25, 300, 464, 0.5), -57);
  });

  it("centers a selected timeline card in the viewport", () => {
    assert.deepEqual(centerTimelinePoint(1200, 800, 950, 300, 1), {
      x: -350,
      y: 100,
    });
  });

  it("uses the same typed default state for initialization and explicit reset", () => {
    const times = [0, DAY_MS, 2 * DAY_MS, 4 * DAY_MS, 6 * DAY_MS];
    const initialized = calculateDefaultTimelineView(times, 6, 3);
    const reset = calculateDefaultTimelineView(times, 6, 3);

    assert.deepEqual(initialized, reset);
    assert.equal(initialized.viewScale, 1);
  });
});

class FakeClassList {
  constructor(private readonly element: FakeElement) {}

  add(...names: string[]): void {
    const next = new Set(this.element.className.split(/\s+/).filter(Boolean));
    names.forEach((name) => next.add(name));
    this.element.className = [...next].join(" ");
  }

  remove(...names: string[]): void {
    const removed = new Set(names);
    this.element.className = this.element.className
      .split(/\s+/)
      .filter((name) => name && !removed.has(name))
      .join(" ");
  }

  contains(name: string): boolean {
    return this.element.className.split(/\s+/).includes(name);
  }

  toggle(name: string, force?: boolean): boolean {
    const next = force ?? !this.contains(name);
    if (next) this.add(name);
    else this.remove(name);
    return next;
  }
}

type FakeListener = (event: Record<string, unknown>) => void;

class FakeElement {
  className = "";
  textContent = "";
  title = "";
  type = "";
  hidden = false;
  src = "";
  alt = "";
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  clientWidth = 1200;
  clientHeight = 800;
  readonly classList = new FakeClassList(this);
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, FakeListener[]>();

  constructor(readonly tagName: string) {}

  append(...nodes: FakeElement[]): void {
    nodes.forEach((node) => this.appendChild(node));
  }

  appendChild(node: FakeElement): FakeElement {
    node.parentElement = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, event: Record<string, unknown> = {}): void {
    const payload = { target: this, ...event };
    for (const listener of this.listeners.get(type) ?? []) listener(payload);
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight };
  }

  closest(selector: string): FakeElement | null {
    if (selector.startsWith(".") && this.classList.contains(selector.slice(1))) return this;
    return this.parentElement?.closest(selector) ?? null;
  }

  setPointerCapture(): void {}
}

function descendantsByClass(root: FakeElement, className: string): FakeElement[] {
  const output: FakeElement[] = [];
  const visit = (node: FakeElement): void => {
    if (node.classList.contains(className)) output.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return output;
}

function descendantByAttribute(
  root: FakeElement,
  name: string,
  value: string,
): FakeElement {
  const visit = (node: FakeElement): FakeElement | null => {
    if (node.getAttribute(name) === value) return node;
    for (const child of node.children) {
      const match = visit(child);
      if (match) return match;
    }
    return null;
  };
  const match = visit(root);
  assert.ok(match, `Missing element with ${name}=${value}`);
  return match;
}

function parseTransform(value: string): { x: number; y: number; scale: number } {
  const match = value.match(/^translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)$/);
  assert.ok(match, `Unexpected transform: ${value}`);
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

function screenCenter(card: FakeElement, scene: FakeElement): { x: number; y: number } {
  const transform = parseTransform(scene.style.transform ?? "");
  return {
    x: transform.x + (Number.parseFloat(card.style.left) + 60) * transform.scale,
    y: transform.y + (Number.parseFloat(card.style.top) + 73) * transform.scale,
  };
}

function timelineItem(index: number): MediaItem {
  const day = String(index + 1).padStart(2, "0");
  return {
    title: index === 8 ? "Newest" : `Title ${index}`,
    originalTitle: "",
    mediaType: "anime",
    format: "tv",
    status: "completed",
    releaseStatus: "finished",
    progress: 1,
    total: 1,
    unit: "episode",
    score: null,
    favorite: false,
    year: 2026,
    genres: [],
    people: [],
    platforms: [],
    sourceUrls: [],
    cover: "",
    filePath: `Media/Anime/${index}.md`,
    updated: 0,
    updatedLabel: "",
    startedAt: "",
    completedAt: `2026-07-${day}`,
    volumeLog: [],
  };
}

function installFakeDom(): void {
  const scope = globalThis as typeof globalThis & {
    createEl: (tag: string) => FakeElement;
    window: {
      setTimeout: (callback: () => void) => number;
      clearTimeout: () => void;
    };
  };
  scope.createEl = (tag) => new FakeElement(tag);
  scope.window = {
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
  };
}

describe("timeline scale DOM integration", () => {
  it("renders distinct dates with at most one card layer per side", () => {
    installFakeDom();
    const container = new FakeElement("div");

    legacyTest.TimelineUI.render(container, Array.from({ length: 9 }, (_, index) => timelineItem(index)), {
      maxStackDepth: 1,
    });

    const lanes = descendantsByClass(container, "al-timeline-card")
      .map((card) => Number(card.dataset.timelineLane));
    assert.equal(Math.max(...lanes), 1);
  });


it("renders dated entries with their configured reading units", () => {
  installFakeDom();
  const container = new FakeElement("div");
  const chapter = {
    ...timelineItem(0), title: "Chapter work", mediaType: "manga", unit: "chapter",
    status: "ongoing", completedAt: "",
    volumeLog: [{ label: "10", startedAt: "", completedAt: "2026-07-01" }],
  };
  const season = {
    ...timelineItem(1), title: "Season work", mediaType: "novel", unit: "season",
    status: "ongoing", completedAt: "",
    volumeLog: [{ label: "2", startedAt: "", completedAt: "2026-07-02" }],
  };
  const volume = {
    ...timelineItem(2), title: "Volume work", mediaType: "novel", unit: "volume",
    status: "ongoing", completedAt: "",
    volumeLog: [{ label: "3", startedAt: "", completedAt: "2026-07-03" }],
  };

  legacyTest.TimelineUI.render(container, [chapter, season, volume], { maxStackDepth: 3 });

  assert.deepEqual(
    descendantsByClass(container, "al-timeline-volume-label").map((label) => label.textContent),
    ["第 10 話", "第 2 季", "第 3 卷"],
  );
});

  it("keeps the timeline axis at the same screen y while wheel-scaling time", () => {
    installFakeDom();
    const container = new FakeElement("div");
    legacyTest.TimelineUI.render(container, Array.from({ length: 9 }, (_, index) => timelineItem(index)), {
      maxStackDepth: 3,
    });

    const viewport = descendantsByClass(container, "al-timeline-viewport")[0];
    const scene = descendantsByClass(container, "al-timeline-scene")[0];
    const initialAxis = descendantsByClass(container, "al-timeline-axis")[0];
    const initialTransform = parseTransform(scene.style.transform);
    const initialAxisScreenY = initialTransform.y
      + Number.parseFloat(initialAxis.style.top) * initialTransform.scale;

    viewport.dispatch("wheel", {
      ctrlKey: true,
      metaKey: false,
      deltaY: 2000,
      clientX: 600,
      preventDefault() {},
    });

    const nextAxis = descendantsByClass(container, "al-timeline-axis")[0];
    const nextTransform = parseTransform(scene.style.transform);
    const nextAxisScreenY = nextTransform.y
      + Number.parseFloat(nextAxis.style.top) * nextTransform.scale;
    assert.ok(Math.abs(nextAxisScreenY - initialAxisScreenY) < 1e-6);
  });

it("centers the latest date horizontally and the timeline axis vertically", () => {
  installFakeDom();
  const container = new FakeElement("div");
  legacyTest.TimelineUI.render(container, Array.from({ length: 9 }, (_, index) => timelineItem(index)), {
    maxStackDepth: 3,
  });

  const viewport = descendantsByClass(container, "al-timeline-viewport")[0];
  const scene = descendantsByClass(container, "al-timeline-scene")[0];
  const latest = descendantsByClass(container, "al-timeline-card")
    .find((card) => card.title.includes("Newest"));
  const initialAxis = descendantsByClass(container, "al-timeline-axis")[0];
  assert.ok(latest);

  const initialCenter = screenCenter(latest, scene);
  const initialTransform = parseTransform(scene.style.transform);
  const initialAxisScreenY = initialTransform.y
    + Number.parseFloat(initialAxis.style.top) * initialTransform.scale;
  assert.equal(initialCenter.x, viewport.clientWidth / 2);
  assert.equal(initialAxisScreenY, viewport.clientHeight / 2);

  descendantByAttribute(container, "aria-label", uiText("timeline.fit")).dispatch("click");
  descendantByAttribute(container, "aria-label", uiText("timeline.reset")).dispatch("click");

  const restoredLatest = descendantsByClass(container, "al-timeline-card")
    .find((card) => card.title.includes("Newest"));
  const restoredAxis = descendantsByClass(container, "al-timeline-axis")[0];
  assert.ok(restoredLatest);
  const restoredCenter = screenCenter(restoredLatest, scene);
  const restoredTransform = parseTransform(scene.style.transform);
  const restoredAxisScreenY = restoredTransform.y
    + Number.parseFloat(restoredAxis.style.top) * restoredTransform.scale;
  assert.equal(restoredCenter.x, viewport.clientWidth / 2);
  assert.equal(restoredAxisScreenY, viewport.clientHeight / 2);
});
});
