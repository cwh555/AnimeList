import type { LibraryMediaFilter } from "./library-contracts";
import type { TimelineMediaEntry } from "../types";
import { compareVolumeLabels, normalizeVolumeLabel } from "../domain/progress/novel-progress";
import { expandTimelineEntries } from "./timeline-entry-expansion";
import { MAX_TIMELINE_DAY_SPACING, MAX_TIMELINE_VIEW_SCALE, MIN_TIMELINE_DAY_SPACING, MIN_TIMELINE_VIEW_SCALE, calculateDefaultTimelineView, preserveTimelineAxisScreenY } from "../domain/timeline/scale";
import { centerLatestTimelineAxis } from "../domain/timeline/corrections";
import { isUnknownCompletionDate } from "../domain/completion-date";
import { uiText } from "../ui-text";
import { timelineWorkspaceText } from "../features/timeline/text";
import { makeEl, parseDateValue, setAnimeListIcon } from "./ui-helpers";
import { createTimelinePosterCard, TIMELINE_CARD_GEOMETRY } from "./timeline-card";
import { animateLayoutChange } from "./layout-motion";

const timelineTitleCollator = new Intl.Collator("zh-Hant", { numeric: true, sensitivity: "base" });

export { TIMELINE_CARD_GEOMETRY } from "./timeline-card";

export const TIMELINE_MEDIA_FILTERS: readonly LibraryMediaFilter[] = [
  "all",
  "anime",
  "manga",
  "novel",
];

export interface TimelineStemGeometry {
  start: number;
  end: number;
  height: number;
}

export function timelineStemGeometry(
  aboveAxis: boolean,
  cardY: number,
  axisY: number,
  cardHeight: number,
): TimelineStemGeometry {
  const start = aboveAxis ? cardY + cardHeight : axisY;
  const end = aboveAxis ? axisY : cardY;
  return { start, end, height: Math.max(1, end - start) };
}

export function compareTimelineEntries(left: TimelineMediaEntry, right: TimelineMediaEntry): number {
  const leftSeries = String(left?.seriesTitle || left?.title || "");
  const rightSeries = String(right?.seriesTitle || right?.title || "");
  const seriesOrder = timelineTitleCollator.compare(leftSeries, rightSeries);
  if (seriesOrder) return seriesOrder;
  const leftVolume = normalizeVolumeLabel(left?.volumeLabel);
  const rightVolume = normalizeVolumeLabel(right?.volumeLabel);
  if (leftVolume && rightVolume) {
    const volumeOrder = compareVolumeLabels(leftVolume, rightVolume);
    if (volumeOrder) return volumeOrder;
  } else if (leftVolume) return 1;
  else if (rightVolume) return -1;
  return timelineTitleCollator.compare(String(left?.title || ""), String(right?.title || ""));
}

interface TimedTimelineEntry extends TimelineMediaEntry {
  completedTime: number;
}

interface TimelineRenderAdapters {
  typeFilter?: LibraryMediaFilter;
  maxStackDepth?: number;
  openFile?: (path: string) => void | Promise<void>;
}

interface TimelineRenderResult {
  items: number;
  totalItems?: number;
  type?: LibraryMediaFilter;
  fitScene?: () => void;
  resetView?: () => void;
  getDaySpacing?: () => number;
  getViewScale?: () => number;
  getSceneWidth?: () => number;
}

export function assignTimelineLanes<T extends { x: number }>(
  positionedItems: T[],
  minimumDistance: number,
): Array<T & { lane: number }> {
  const laneEnds: number[] = [];
  return positionedItems.map((positioned) => {
    let lane = laneEnds.findIndex((lastX) => positioned.x - lastX >= minimumDistance);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = positioned.x;
    return { ...positioned, lane };
  });
}

export function filterTimelineEntries<T extends Pick<TimelineMediaEntry, "mediaType">>(
  items: T[],
  mediaType: LibraryMediaFilter,
): T[] {
  if (mediaType !== "anime" && mediaType !== "manga" && mediaType !== "novel") return items;
  return items.filter((item) => item.mediaType === mediaType);
}

export const TimelineUI = (() => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MIN_DAY_SPACING = MIN_TIMELINE_DAY_SPACING;
  const MAX_DAY_SPACING = MAX_TIMELINE_DAY_SPACING;
  const MIN_VIEW_SCALE = MIN_TIMELINE_VIEW_SCALE;
  const MAX_VIEW_SCALE = MAX_TIMELINE_VIEW_SCALE;
  const CARD_WIDTH = TIMELINE_CARD_GEOMETRY.width;
  const CARD_HEIGHT = TIMELINE_CARD_GEOMETRY.cardHeight;
  const CARD_GAP_X = TIMELINE_CARD_GEOMETRY.gapX;
  const CARD_GAP_Y = TIMELINE_CARD_GEOMETRY.gapY;
  const STEM_GAP = TIMELINE_CARD_GEOMETRY.stemGap;
  const SCENE_PADDING_Y = 56;
  const dayStart = (value: unknown): number => {
    const time = parseDateValue(value);
    if (!time) return 0;
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  };
  const formatDate = (time: number): string => {
    const date = new Date(time);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const tickStepForSpacing = (spacing: number): number => {
    const candidates = [1, 2, 3, 7, 14, 30, 60, 90, 180, 365, 730];
    return candidates.find((step) => step * spacing >= 88) || 1460;
  };

  function render(
    container: HTMLElement,
    inputItems: TimelineMediaEntry[],
    adapters: TimelineRenderAdapters = {},
  ): TimelineRenderResult {
    container.replaceChildren();
    const expandedItems = expandTimelineEntries(inputItems);
    const allUnknownItems = expandedItems.filter((item) => isUnknownCompletionDate(item.completedAt)).sort(compareTimelineEntries);
    const allItems: TimedTimelineEntry[] = expandedItems
      .filter((item) => !isUnknownCompletionDate(item.completedAt))
      .map((item): TimedTimelineEntry => ({ ...item, completedTime: dayStart(item.completedAt) }))
      .filter((item) => item.completedTime)
      .sort((a, b) => a.completedTime - b.completedTime || compareTimelineEntries(a, b));

    const selectedType = adapters.typeFilter === "anime"
      || adapters.typeFilter === "manga"
      || adapters.typeFilter === "novel"
      ? adapters.typeFilter
      : "all";
    const items = filterTimelineEntries(allItems, selectedType);
    const unknownItems = filterTimelineEntries(allUnknownItems, selectedType);
    if (!items.length && !unknownItems.length) {
      const empty = makeEl("div", "al-timeline-empty");
      setAnimeListIcon(empty, "timeline");
      empty.append(makeEl("strong", "", uiText("timeline.emptyTitle")), makeEl("span", "", uiText("timeline.emptyDescription")));
      container.appendChild(empty);
      return { items: 0, totalItems: allItems.length + allUnknownItems.length, type: selectedType };
    }

    const sidePadding = 170;
    const grouped = new Map<number, TimelineMediaEntry[]>();
    for (const item of items) {
      const key = item.completedTime;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }
    const dates = [...grouped.keys()].sort((a, b) => a - b);
    const minTime = dates[0] || 0;
    const maxTime = dates[dates.length - 1] || minTime;
    const rangeDays = Math.max(1, Math.round((maxTime - minTime) / DAY_MS));
    const defaultView = calculateDefaultTimelineView(
      items.map((item) => item.completedTime),
      rangeDays,
      adapters.maxStackDepth,
    );
    const baseSpacing = defaultView.daySpacing;
    const state = {
      x: 0,
      y: 0,
      daySpacing: defaultView.daySpacing,
      viewScale: defaultView.viewScale,
      sceneWidth: 0,
      sceneHeight: 0,
      axisY: 0,
      latestItemCenterX: 0,
    };

    const root = makeEl("div", "al-timeline-root");
    const toolbar = makeEl("div", "al-timeline-toolbar");
    const copy = makeEl("div", "al-timeline-copy");
    copy.append(
      makeEl("strong", "", uiText("timeline.title")),
      makeEl("span", "", items.length
        ? uiText("timeline.summary", { count: items.length, start: formatDate(minTime), end: formatDate(maxTime) })
        : uiText("timeline.summaryEmpty")),
    );
    const typeFilters = makeEl("div", "al-timeline-type-filters");
    typeFilters.setAttribute("role", "group");
    typeFilters.setAttribute("aria-label", uiText("timeline.title"));
    const typeLabels: Record<LibraryMediaFilter, string> = {
      all: uiText("timeline.filterAll"),
      anime: uiText("media.type.anime"),
      manga: uiText("media.type.manga"),
      novel: uiText("media.type.novel"),
    };
    for (const type of TIMELINE_MEDIA_FILTERS) {
      const label = typeLabels[type];
      const button = makeEl("button", `al-timeline-type-filter${selectedType === type ? " is-active" : ""}`, label);
      button.type = "button";
      button.setAttribute("aria-pressed", selectedType === type ? "true" : "false");
      button.addEventListener("click", () => {
        if (selectedType === type) return;
        render(container, inputItems, { ...adapters, typeFilter: type });
      });
      typeFilters.appendChild(button);
    }
    const controls = makeEl("div", "al-timeline-controls");
    const spacingControls = makeEl("div", "al-timeline-control-group");
    spacingControls.setAttribute("role", "group");
    spacingControls.setAttribute("aria-label", uiText("timeline.spacingControls"));
    const zoomOut = makeEl("button", "", "");
    zoomOut.type = "button"; zoomOut.title = uiText("timeline.zoomOut"); zoomOut.setAttribute("aria-label", zoomOut.title); setAnimeListIcon(zoomOut, "minus");
    const zoomLabel = makeEl("span", "al-timeline-zoom", "100%");
    const zoomIn = makeEl("button", "", "");
    zoomIn.type = "button"; zoomIn.title = uiText("timeline.zoomIn"); zoomIn.setAttribute("aria-label", zoomIn.title); setAnimeListIcon(zoomIn, "plus");
    spacingControls.append(zoomOut, zoomLabel, zoomIn);

    const scaleControls = makeEl("div", "al-timeline-control-group");
    scaleControls.setAttribute("role", "group");
    scaleControls.setAttribute("aria-label", uiText("timeline.scaleControls"));
    const scaleOut = makeEl("button", "", "");
    scaleOut.type = "button"; scaleOut.title = uiText("timeline.scaleOut"); scaleOut.setAttribute("aria-label", scaleOut.title); setAnimeListIcon(scaleOut, "minus");
    const scaleLabel = makeEl("span", "al-timeline-scale", uiText("timeline.scaleLabel", { percent: 100 }));
    const scaleIn = makeEl("button", "", "");
    scaleIn.type = "button"; scaleIn.title = uiText("timeline.scaleIn"); scaleIn.setAttribute("aria-label", scaleIn.title); setAnimeListIcon(scaleIn, "plus");
    scaleControls.append(scaleOut, scaleLabel, scaleIn);

    const reset = makeEl("button", "", "");
    reset.type = "button"; reset.title = uiText("timeline.reset"); reset.setAttribute("aria-label", reset.title); setAnimeListIcon(reset, "rotate-ccw");
    const fit = makeEl("button", "", "");
    fit.type = "button"; fit.title = uiText("timeline.fit"); fit.setAttribute("aria-label", fit.title); setAnimeListIcon(fit, "fit");
    controls.append(spacingControls, scaleControls, reset, fit);
    controls.hidden = !items.length;
    toolbar.append(copy, typeFilters, controls);
    root.appendChild(toolbar);

    const appendUnknownDimension = (): void => {
      if (!unknownItems.length) return;
      const section = makeEl("section", "al-timeline-undated-dimension al-timeline-temporal-dimension");
      section.dataset.temporalDimension = "unknown";
      const header = makeEl("header", "al-timeline-undated-header");
      header.append(makeEl("strong", "", timelineWorkspaceText("timeline.undatedTitle")), makeEl("span", "", timelineWorkspaceText("timeline.undatedDescription")));
      const rail = makeEl("div", "al-timeline-undated-rail");
      for (const item of unknownItems) rail.appendChild(createTimelinePosterCard(item, {
        dateLabel: timelineWorkspaceText("timeline.undatedTitle"),
        className: "al-timeline-card al-timeline-undated-card",
        openFile: adapters.openFile ?? (() => {}),
      }));
      section.append(header, rail);
      root.appendChild(section);
    };

    if (!items.length) {
      appendUnknownDimension();
      container.appendChild(root);
      return { items: unknownItems.length, totalItems: allItems.length + allUnknownItems.length, type: selectedType };
    }

    const viewport = makeEl("div", "al-timeline-viewport");
    const scene = makeEl("div", "al-timeline-scene");
    viewport.appendChild(scene);
    root.appendChild(viewport);
    appendUnknownDimension();
    container.appendChild(root);
    const openFile = adapters.openFile ?? (() => {});
    const timelinePosterCache = new Map<string, HTMLButtonElement>();
    const timelineEntryKey = (item: TimelineMediaEntry): string =>
      `${item.filePath}::${item.volumeLabel ?? ""}::${item.completedAt}::${item.title}::${item.cover ?? ""}`;

    const applyPan = (): void => {
      scene.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.viewScale})`;
      zoomLabel.textContent = uiText("timeline.zoomLabel", { percent: Math.round((state.daySpacing / baseSpacing) * 100), spacing: state.daySpacing.toFixed(state.daySpacing < 10 ? 1 : 0) });
      scaleLabel.textContent = uiText("timeline.scaleLabel", { percent: Math.round(state.viewScale * 100) });
    };

    const renderGeometry = (): void => {
      const viewportWidth = Math.max(720, viewport.clientWidth || 1200);
      state.sceneWidth = Math.max(viewportWidth / state.viewScale, sidePadding * 2 + rangeDays * state.daySpacing);

      const positionedItems = items.map((item) => ({
        item,
        time: item.completedTime,
        x: sidePadding + Math.round((item.completedTime - minTime) / DAY_MS) * state.daySpacing,
      }));
      const laidOutItems = assignTimelineLanes(
        positionedItems,
        CARD_WIDTH + CARD_GAP_X,
      );
      const laneCount = Math.max(1, ...laidOutItems.map((positioned) => positioned.lane + 1));
      const aboveLaneCount = Math.ceil(laneCount / 2);
      const belowLaneCount = Math.floor(laneCount / 2);
      const axisY = SCENE_PADDING_Y + STEM_GAP
        + aboveLaneCount * (CARD_HEIGHT + CARD_GAP_Y) - CARD_GAP_Y;
      state.axisY = axisY;
      state.sceneHeight = axisY + SCENE_PADDING_Y
        + (belowLaneCount > 0
          ? STEM_GAP + belowLaneCount * (CARD_HEIGHT + CARD_GAP_Y) - CARD_GAP_Y
          : 0);

      const geometryNodes: HTMLElement[] = [];
      const axis = makeEl("div", "al-timeline-axis");
      axis.style.left = `${sidePadding}px`;
      axis.style.top = `${axisY}px`;
      axis.style.width = `${Math.max(1, rangeDays * state.daySpacing)}px`;
      geometryNodes.push(axis);

      const tickStep = tickStepForSpacing(state.daySpacing);
      for (let day = 0; day <= rangeDays; day += tickStep) {
        const tick = makeEl("div", "al-timeline-tick");
        tick.style.left = `${sidePadding + day * state.daySpacing}px`;
        tick.style.top = `${axisY - 7}px`;
        tick.appendChild(makeEl("span", "", formatDate(minTime + day * DAY_MS)));
        geometryNodes.push(tick);
      }
      if (rangeDays % tickStep !== 0) {
        const tick = makeEl("div", "al-timeline-tick");
        tick.style.left = `${sidePadding + rangeDays * state.daySpacing}px`;
        tick.style.top = `${axisY - 7}px`;
        tick.appendChild(makeEl("span", "", formatDate(maxTime)));
        geometryNodes.push(tick);
      }

      dates.forEach((time) => {
        const x = sidePadding + Math.round((time - minTime) / DAY_MS) * state.daySpacing;
        const dayMarker = makeEl("div", "al-timeline-day-marker");
        dayMarker.style.left = `${x - 5}px`;
        dayMarker.style.top = `${axisY - 5}px`;
        geometryNodes.push(dayMarker);
      });

      const nextKeys = new Set<string>();
      const cards = laidOutItems.map(({ item, time, x, lane }, index) => {
        const level = Math.floor(lane / 2);
        const aboveAxis = lane % 2 === 0;
        const cardY = aboveAxis
          ? axisY - STEM_GAP - CARD_HEIGHT - level * (CARD_HEIGHT + CARD_GAP_Y)
          : axisY + STEM_GAP + level * (CARD_HEIGHT + CARD_GAP_Y);
        const geometry = timelineStemGeometry(aboveAxis, cardY, axisY, CARD_HEIGHT);
        const stem = makeEl("div", "al-timeline-stem");
        stem.style.left = `${x}px`;
        stem.style.top = `${geometry.start}px`;
        stem.style.height = `${geometry.height}px`;
        geometryNodes.push(stem);

        const key = timelineEntryKey(item);
        nextKeys.add(key);
        let card = timelinePosterCache.get(key);
        if (!card) {
          card = createTimelinePosterCard(item, { time, openFile });
          timelinePosterCache.set(key, card);
        }
        if (index === laidOutItems.length - 1) state.latestItemCenterX = x;
        return { card, lane, x, cardY };
      });

      for (const [key, card] of timelinePosterCache) {
        if (nextKeys.has(key)) continue;
        if (card.parentElement) card.parentElement.removeChild(card);
        timelinePosterCache.delete(key);
      }
      const movingCards = cards.map(({ card }) => card).filter((card) => card.isConnected);
      void animateLayoutChange(movingCards, () => {
        scene.replaceChildren();
        scene.style.width = `${state.sceneWidth}px`;
        scene.style.height = `${state.sceneHeight}px`;
        scene.append(...geometryNodes);
        for (const { card, lane, x, cardY } of cards) {
          card.dataset.timelineLane = String(lane);
          card.style.left = `${x - CARD_WIDTH / 2}px`;
          card.style.top = `${cardY}px`;
          card.style.height = `${CARD_HEIGHT}px`;
          scene.appendChild(card);
        }
      });
      applyPan();
    };

    const setDaySpacingAt = (nextSpacing: number, clientX: number): void => {
      const rect = viewport.getBoundingClientRect();
      const localX = Number.isFinite(clientX) ? clientX - rect.left : viewport.clientWidth / 2;
      const previous = state.daySpacing;
      const next = Math.min(MAX_DAY_SPACING, Math.max(MIN_DAY_SPACING, nextSpacing));
      if (Math.abs(next - previous) < 1e-6) return;
      const dayAtCursor = (((localX - state.x) / state.viewScale) - sidePadding) / previous;
      const previousAxisY = state.axisY;
      state.daySpacing = next;
      renderGeometry();
      state.x = localX - (sidePadding + dayAtCursor * next) * state.viewScale;
      state.y = preserveTimelineAxisScreenY(
        state.y,
        previousAxisY,
        state.axisY,
        state.viewScale,
      );
      applyPan();
    };

    const setViewScaleAt = (nextScale: number, clientX: number, clientY: number): void => {
      const rect = viewport.getBoundingClientRect();
      const localX = Number.isFinite(clientX) ? clientX - rect.left : viewport.clientWidth / 2;
      const localY = Number.isFinite(clientY) ? clientY - rect.top : viewport.clientHeight / 2;
      const previous = state.viewScale;
      const next = Math.min(MAX_VIEW_SCALE, Math.max(MIN_VIEW_SCALE, nextScale));
      if (Math.abs(next - previous) < 1e-6) return;
      const sceneX = (localX - state.x) / previous;
      const sceneY = (localY - state.y) / previous;
      state.viewScale = next;
      renderGeometry();
      state.x = localX - sceneX * next;
      state.y = localY - sceneY * next;
      applyPan();
    };

    const centerScene = (): void => {
      state.x = (viewport.clientWidth - state.sceneWidth * state.viewScale) / 2;
      state.y = (viewport.clientHeight - state.sceneHeight * state.viewScale) / 2;
      applyPan();
    };

    const centerLatestItem = (): void => {
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

    const resetView = (): void => {
      state.daySpacing = defaultView.daySpacing;
      state.viewScale = defaultView.viewScale;
      renderGeometry();
      centerLatestItem();
    };

    const fitScene = (): void => {
      const availableWidth = Math.max(260, viewport.clientWidth / state.viewScale - sidePadding * 2);
      state.daySpacing = Math.min(MAX_DAY_SPACING, Math.max(MIN_DAY_SPACING, availableWidth / rangeDays));
      renderGeometry();
      centerScene();
    };

    const viewportCenter = (): { x: number; y: number } => {
      const rect = viewport.getBoundingClientRect();
      return { x: rect.left + viewport.clientWidth / 2, y: rect.top + viewport.clientHeight / 2 };
    };
    zoomIn.addEventListener("click", () => { const center = viewportCenter(); setDaySpacingAt(state.daySpacing * 1.25, center.x); });
    zoomOut.addEventListener("click", () => { const center = viewportCenter(); setDaySpacingAt(state.daySpacing / 1.25, center.x); });
    scaleIn.addEventListener("click", () => { const center = viewportCenter(); setViewScaleAt(state.viewScale * 1.15, center.x, center.y); });
    scaleOut.addEventListener("click", () => { const center = viewportCenter(); setViewScaleAt(state.viewScale / 1.15, center.x, center.y); });
    reset.addEventListener("click", resetView);
    fit.addEventListener("click", fitScene);
    viewport.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) setDaySpacingAt(state.daySpacing * Math.exp(-event.deltaY * 0.002), event.clientX);
      else {
        state.x -= event.deltaX || (event.shiftKey ? event.deltaY : 0);
        state.y -= event.shiftKey ? 0 : event.deltaY;
        applyPan();
      }
    }, { passive: false });

    let dragging: { id: number; x: number; y: number; startX: number; startY: number } | null = null;
    viewport.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest(".al-timeline-card"))) return;
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: state.x, startY: state.y };
      viewport.classList.add("is-dragging");
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!dragging || dragging.id !== event.pointerId) return;
      state.x = dragging.startX + event.clientX - dragging.x;
      state.y = dragging.startY + event.clientY - dragging.y;
      applyPan();
    });
    const stopDrag = (event: PointerEvent): void => {
      if (!dragging || dragging.id !== event.pointerId) return;
      dragging = null;
      viewport.classList.remove("is-dragging");
    };
    viewport.addEventListener("pointerup", stopDrag);
    viewport.addEventListener("pointercancel", stopDrag);

    renderGeometry();
    window.setTimeout(resetView, 0);
    return {
      items: items.length,
      totalItems: allItems.length + allUnknownItems.length,
      type: selectedType,
      fitScene,
      resetView,
      getDaySpacing: () => state.daySpacing,
      getViewScale: () => state.viewScale,
      getSceneWidth: () => state.sceneWidth,
    };
  }

  return { render };
})();
