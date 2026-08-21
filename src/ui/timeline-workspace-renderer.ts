import type { LibraryMediaFilter } from "./library-contracts";
import type { TimelineMediaEntry } from "../types";
import { expandTimelineEntries } from "./timeline-entry-expansion";
import { calculateDefaultTimelineDaySpacing, MAX_TIMELINE_DAY_SPACING, MIN_TIMELINE_DAY_SPACING } from "../domain/timeline/scale";
import {
  buildTimelineDensity,
  formatTimelineDate,
  formatTimelineDay,
  groupTimelineHistory,
  timelineTickStepForSpacing,
  timelineTimeForX,
  timelineXForTime,
  TIMELINE_DAY_MS,
} from "../domain/timeline/layout";
import { createTimelinePosterCard, TIMELINE_CARD_GEOMETRY } from "./timeline-card";
import { assignTimelineLanes, compareTimelineEntries, filterTimelineEntries, timelineStemGeometry, TIMELINE_MEDIA_FILTERS } from "./timeline-renderer";
import { timelineWorkspaceText } from "../features/timeline/text";
import { uiText } from "../ui-text";
import { makeEl, parseDateValue, setAnimeListIcon } from "./ui-helpers";

interface TimedTimelineEntry extends TimelineMediaEntry { completedTime: number; }

export interface TimelineWorkspaceOptions {
  typeFilter?: LibraryMediaFilter;
  maxStackDepth?: number;
  openFile?: (path: string) => void | Promise<void>;
}

export type TimelineWorkspaceMode = "scale" | "history";

export interface TimelineWorkspaceResult {
  items: number;
  totalItems: number;
  type: LibraryMediaFilter;
  mode: TimelineWorkspaceMode;
}

const CARD_WIDTH = TIMELINE_CARD_GEOMETRY.width;
const CARD_HEIGHT = TIMELINE_CARD_GEOMETRY.cardHeight;
const CARD_GAP_X = TIMELINE_CARD_GEOMETRY.gapX;
const CARD_GAP_Y = TIMELINE_CARD_GEOMETRY.gapY;
const STEM_GAP = TIMELINE_CARD_GEOMETRY.stemGap;
const SIDE_PADDING = 72;
const SCENE_PADDING_Y = 42;

function dayStart(value: unknown): number {
  const time = parseDateValue(value);
  if (!time) return 0;
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function selectedMediaType(value: LibraryMediaFilter | undefined): LibraryMediaFilter {
  return value === "anime" || value === "manga" || value === "novel" ? value : "all";
}

function windowSize(root: HTMLElement): "compact" | "medium" | "expanded" {
  const shell = root.closest<HTMLElement>(".al-workspace-shell");
  return shell?.dataset.windowSize === "compact" || shell?.dataset.windowSize === "medium"
    ? shell.dataset.windowSize
    : "expanded";
}

export function renderTimelineWorkspace(
  container: HTMLElement,
  inputItems: TimelineMediaEntry[],
  options: TimelineWorkspaceOptions = {},
): TimelineWorkspaceResult {
  container.replaceChildren();
  const allItems = expandTimelineEntries(inputItems)
    .map((item): TimedTimelineEntry => ({ ...item, completedTime: dayStart(item.completedAt) }))
    .filter((item) => item.completedTime)
    .sort((left, right) => left.completedTime - right.completedTime || compareTimelineEntries(left, right));

  const openFile = options.openFile ?? (() => undefined);
  const state: {
    mode: TimelineWorkspaceMode;
    type: LibraryMediaFilter;
    daySpacing: number;
    panX: number;
    focusTime: number;
  } = {
    mode: "scale",
    type: selectedMediaType(options.typeFilter),
    daySpacing: 1,
    panX: 0,
    focusTime: 0,
  };

  const root = makeEl("div", "al-timeline-workspace");
  const summary = makeEl("div", "al-timeline-workspace-summary");
  const controls = makeEl("div", "al-timeline-workspace-controls");
  const modeGroup = makeEl("div", "al-timeline-view-modes");
  modeGroup.setAttribute("role", "group");
  modeGroup.setAttribute("aria-label", timelineWorkspaceText("timeline.viewModeLabel"));
  const scaleMode = makeEl("button", "al-timeline-view-mode", timelineWorkspaceText("timeline.viewScale"));
  scaleMode.type = "button";
  const historyMode = makeEl("button", "al-timeline-view-mode", timelineWorkspaceText("timeline.viewHistory"));
  historyMode.type = "button";
  modeGroup.append(scaleMode, historyMode);

  const typeGroup = makeEl("div", "al-timeline-type-filters");
  typeGroup.setAttribute("role", "group");
  typeGroup.setAttribute("aria-label", timelineWorkspaceText("timeline.mediaFilterLabel"));
  const typeLabels: Record<LibraryMediaFilter, string> = {
    all: uiText("timeline.filterAll"),
    anime: uiText("media.type.anime"),
    manga: uiText("media.type.manga"),
    novel: uiText("media.type.novel"),
  };
  const typeButtons = new Map<LibraryMediaFilter, HTMLButtonElement>();
  for (const type of TIMELINE_MEDIA_FILTERS) {
    const button = makeEl("button", "al-timeline-type-filter", typeLabels[type]);
    button.type = "button";
    typeButtons.set(type, button);
    typeGroup.appendChild(button);
  }

  const scaleActions = makeEl("div", "al-timeline-scale-actions");
  const spacingControls = makeEl("div", "al-timeline-control-group");
  spacingControls.setAttribute("role", "group");
  spacingControls.setAttribute("aria-label", uiText("timeline.spacingControls"));
  const zoomOut = makeEl("button", "", "");
  zoomOut.type = "button"; zoomOut.title = uiText("timeline.zoomOut"); zoomOut.setAttribute("aria-label", zoomOut.title); setAnimeListIcon(zoomOut, "minus");
  const zoomLabel = makeEl("span", "al-timeline-zoom", "100%");
  const zoomIn = makeEl("button", "", "");
  zoomIn.type = "button"; zoomIn.title = uiText("timeline.zoomIn"); zoomIn.setAttribute("aria-label", zoomIn.title); setAnimeListIcon(zoomIn, "plus");
  spacingControls.append(zoomOut, zoomLabel, zoomIn);
  const fit = makeEl("button", "al-timeline-tool-button", "");
  fit.type = "button"; fit.title = uiText("timeline.fit"); fit.setAttribute("aria-label", fit.title); setAnimeListIcon(fit, "fit");
  const reset = makeEl("button", "al-timeline-tool-button", "");
  reset.type = "button"; reset.title = uiText("timeline.reset"); reset.setAttribute("aria-label", reset.title); setAnimeListIcon(reset, "rotate-ccw");
  scaleActions.append(spacingControls, fit, reset);
  controls.append(modeGroup, typeGroup, scaleActions);

  const body = makeEl("div", "al-timeline-workspace-body");
  root.append(summary, controls, body);
  container.appendChild(root);

  let currentItems: TimedTimelineEntry[] = [];
  let minimumTime = 0;
  let maximumTime = 0;
  let rangeDays = 1;
  let baseDaySpacing = 1;
  let viewport: HTMLElement | null = null;
  let scene: HTMLElement | null = null;
  let sceneWidth = 0;
  let updateOverviewWindow: (() => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let lastWindowSize = windowSize(root);

  function refreshData(preserveSpacing = true): void {
    currentItems = filterTimelineEntries(allItems, state.type);
    minimumTime = currentItems[0]?.completedTime ?? 0;
    maximumTime = currentItems[currentItems.length - 1]?.completedTime ?? minimumTime;
    rangeDays = Math.max(1, (maximumTime - minimumTime) / TIMELINE_DAY_MS);
    baseDaySpacing = calculateDefaultTimelineDaySpacing(
      currentItems.map((item) => item.completedTime),
      Math.max(1, Math.round(rangeDays)),
      options.maxStackDepth ?? 3,
    );
    if (!preserveSpacing || !state.daySpacing || state.daySpacing === 1) state.daySpacing = baseDaySpacing;
    if (!state.focusTime || state.focusTime < minimumTime || state.focusTime > maximumTime) state.focusTime = maximumTime;
    summary.textContent = currentItems.length
      ? uiText("timeline.summary", { count: currentItems.length, start: formatTimelineDate(minimumTime), end: formatTimelineDate(maximumTime) })
      : uiText("timeline.summaryEmpty");
  }

  function syncControls(): void {
    scaleMode.classList.toggle("is-active", state.mode === "scale");
    historyMode.classList.toggle("is-active", state.mode === "history");
    scaleMode.setAttribute("aria-pressed", state.mode === "scale" ? "true" : "false");
    historyMode.setAttribute("aria-pressed", state.mode === "history" ? "true" : "false");
    for (const [type, button] of typeButtons) {
      const active = type === state.type;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
    scaleActions.hidden = state.mode !== "scale" || !currentItems.length;
    zoomLabel.textContent = uiText("timeline.zoomLabel", {
      percent: Math.round((state.daySpacing / Math.max(baseDaySpacing, Number.EPSILON)) * 100),
      spacing: state.daySpacing.toFixed(state.daySpacing < 10 ? 1 : 0),
    });
  }

  function renderHistory(): void {
    body.replaceChildren();
    viewport = null;
    scene = null;
    updateOverviewWindow = null;
    const history = makeEl("div", "al-timeline-history");
    if (!currentItems.length) {
      history.appendChild(makeEl("div", "al-timeline-empty", uiText("timeline.emptyTitle")));
      body.appendChild(history);
      return;
    }
    for (const year of groupTimelineHistory(currentItems)) {
      const yearSection = makeEl("section", "al-timeline-history-year");
      yearSection.appendChild(makeEl("h2", "al-timeline-history-year-title", String(year.year)));
      for (const month of year.months) {
        const monthSection = makeEl("section", "al-timeline-history-month");
        const heading = makeEl("header", "al-timeline-history-month-header");
        heading.append(
          makeEl("h3", "", timelineWorkspaceText("timeline.monthLabel", { month: month.month })),
          makeEl("span", "", timelineWorkspaceText("timeline.historyCount", { count: month.items.length })),
        );
        const grid = makeEl("div", "al-timeline-history-grid");
        for (const item of month.items) {
          const cell = makeEl("div", "al-timeline-history-item");
          const card = createTimelinePosterCard(item, { time: item.completedTime, openFile });
          cell.append(card, makeEl("time", "al-timeline-history-date", formatTimelineDay(item.completedTime)));
          grid.appendChild(cell);
        }
        monthSection.append(heading, grid);
        yearSection.appendChild(monthSection);
      }
      history.appendChild(yearSection);
    }
    body.appendChild(history);
  }

  function applyPan(): void {
    if (!scene) return;
    scene.style.transform = `translateX(${state.panX}px)`;
    updateOverviewWindow?.();
  }

  function centerFocus(): void {
    if (!viewport || !scene || !currentItems.length) return;
    const focusX = timelineXForTime(state.focusTime, minimumTime, state.daySpacing, SIDE_PADDING);
    state.panX = viewport.clientWidth / 2 - focusX;
    applyPan();
  }

  function renderScaleGeometry(): void {
    if (!viewport || !scene) return;
    scene.replaceChildren();
    const compact = windowSize(root) === "compact";
    const positioned = currentItems.map((item) => ({
      item,
      time: item.completedTime,
      x: timelineXForTime(item.completedTime, minimumTime, state.daySpacing, SIDE_PADDING),
    }));
    const laidOut = assignTimelineLanes(positioned, CARD_WIDTH + CARD_GAP_X);
    const laneCount = Math.max(1, ...laidOut.map((item) => item.lane + 1));
    const aboveCount = compact ? laneCount : Math.ceil(laneCount / 2);
    const belowCount = compact ? 0 : Math.floor(laneCount / 2);
    const axisY = SCENE_PADDING_Y + STEM_GAP + aboveCount * (CARD_HEIGHT + CARD_GAP_Y) - CARD_GAP_Y;
    const sceneHeight = axisY + SCENE_PADDING_Y + (belowCount > 0 ? STEM_GAP + belowCount * (CARD_HEIGHT + CARD_GAP_Y) - CARD_GAP_Y : 0);
    sceneWidth = Math.max(viewport.clientWidth, SIDE_PADDING * 2 + rangeDays * state.daySpacing);
    scene.style.width = `${sceneWidth}px`;
    scene.style.height = `${Math.max(sceneHeight, viewport.clientHeight)}px`;

    const axis = makeEl("div", "al-timeline-axis");
    axis.style.left = `${SIDE_PADDING}px`;
    axis.style.top = `${axisY}px`;
    axis.style.width = `${Math.max(1, rangeDays * state.daySpacing)}px`;
    scene.appendChild(axis);

    const tickStep = timelineTickStepForSpacing(state.daySpacing);
    for (let day = 0; day <= rangeDays; day += tickStep) {
      const tick = makeEl("div", "al-timeline-tick");
      tick.style.left = `${SIDE_PADDING + day * state.daySpacing}px`;
      tick.style.top = `${axisY - 7}px`;
      tick.appendChild(makeEl("span", "", formatTimelineDate(minimumTime + day * TIMELINE_DAY_MS)));
      scene.appendChild(tick);
    }

    const uniqueTimes = [...new Set(currentItems.map((item) => item.completedTime))];
    for (const time of uniqueTimes) {
      const x = timelineXForTime(time, minimumTime, state.daySpacing, SIDE_PADDING);
      const marker = makeEl("div", "al-timeline-day-marker");
      marker.style.left = `${x - 5}px`;
      marker.style.top = `${axisY - 5}px`;
      scene.appendChild(marker);
    }

    for (const { item, time, x, lane } of laidOut) {
      const above = compact || lane % 2 === 0;
      const level = compact ? lane : Math.floor(lane / 2);
      const cardY = above
        ? axisY - STEM_GAP - CARD_HEIGHT - level * (CARD_HEIGHT + CARD_GAP_Y)
        : axisY + STEM_GAP + level * (CARD_HEIGHT + CARD_GAP_Y);
      const stemGeometry = timelineStemGeometry(above, cardY, axisY, CARD_HEIGHT);
      const stem = makeEl("div", "al-timeline-stem");
      stem.style.left = `${x}px`;
      stem.style.top = `${stemGeometry.start}px`;
      stem.style.height = `${stemGeometry.height}px`;
      scene.appendChild(stem);
      const card = createTimelinePosterCard(item, { time, openFile });
      card.dataset.timelineLane = String(lane);
      card.style.left = `${x - CARD_WIDTH / 2}px`;
      card.style.top = `${cardY}px`;
      scene.appendChild(card);
    }
    applyPan();
  }

  function renderOverview(): void {
    if (!currentItems.length || !viewport) return;
    const overview = makeEl("div", "al-timeline-overview");
    overview.setAttribute("role", "button");
    overview.setAttribute("tabindex", "0");
    overview.setAttribute("aria-label", timelineWorkspaceText("timeline.overviewLabel"));
    const label = makeEl("span", "al-timeline-overview-label", timelineWorkspaceText("timeline.density"));
    const bars = makeEl("div", "al-timeline-overview-bars");
    const density = buildTimelineDensity(currentItems.map((item) => item.completedTime), minimumTime, maximumTime);
    const maximumCount = Math.max(1, ...density.map((bin) => bin.count));
    for (const bin of density) {
      const bar = makeEl("span", "al-timeline-overview-bar");
      bar.style.height = `${Math.max(2, Math.round((bin.count / maximumCount) * 28))}px`;
      bars.appendChild(bar);
    }
    const windowEl = makeEl("span", "al-timeline-overview-window");
    bars.appendChild(windowEl);
    overview.append(label, bars);
    body.appendChild(overview);

    updateOverviewWindow = () => {
      if (!viewport) return;
      const visibleStart = timelineTimeForX(0 - state.panX, minimumTime, state.daySpacing, SIDE_PADDING);
      const visibleEnd = timelineTimeForX(viewport.clientWidth - state.panX, minimumTime, state.daySpacing, SIDE_PADDING);
      const range = Math.max(TIMELINE_DAY_MS, maximumTime - minimumTime);
      const left = Math.max(0, Math.min(1, (visibleStart - minimumTime) / range));
      const right = Math.max(left, Math.min(1, (visibleEnd - minimumTime) / range));
      windowEl.style.left = `${left * 100}%`;
      windowEl.style.width = `${Math.max(3, (right - left) * 100)}%`;
    };

    const jump = (clientX: number): void => {
      const rect = bars.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      state.focusTime = minimumTime + ratio * (maximumTime - minimumTime);
      centerFocus();
    };
    overview.addEventListener("click", (event) => jump(event.clientX));
    overview.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") state.focusTime = Math.max(minimumTime, state.focusTime - 7 * TIMELINE_DAY_MS);
      else if (event.key === "ArrowRight") state.focusTime = Math.min(maximumTime, state.focusTime + 7 * TIMELINE_DAY_MS);
      else return;
      event.preventDefault();
      centerFocus();
    });
    updateOverviewWindow();
  }

  function renderScale(): void {
    body.replaceChildren();
    if (!currentItems.length) {
      body.appendChild(makeEl("div", "al-timeline-empty", uiText("timeline.emptyTitle")));
      return;
    }
    const wrap = makeEl("section", "al-timeline-scale-wrap");
    viewport = makeEl("div", "al-timeline-viewport al-timeline-workspace-viewport");
    scene = makeEl("div", "al-timeline-scene");
    viewport.appendChild(scene);
    wrap.appendChild(viewport);
    body.appendChild(wrap);
    renderScaleGeometry();
    renderOverview();
    centerFocus();

    let drag: { id: number; x: number; startPanX: number } | null = null;
    viewport.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest(".al-timeline-card"))) return;
      drag = { id: event.pointerId, x: event.clientX, startPanX: state.panX };
      viewport?.classList.add("is-dragging");
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      state.panX = drag.startPanX + event.clientX - drag.x;
      applyPan();
    });
    const endDrag = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      drag = null;
      viewport?.classList.remove("is-dragging");
    };
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("wheel", (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setDaySpacing(state.daySpacing * Math.exp(-event.deltaY * 0.002), event.clientX);
    }, { passive: false });
  }

  function setDaySpacing(nextSpacing: number, clientX?: number): void {
    if (!viewport || !scene) return;
    const next = Math.max(MIN_TIMELINE_DAY_SPACING, Math.min(MAX_TIMELINE_DAY_SPACING, nextSpacing));
    if (Math.abs(next - state.daySpacing) < 1e-6) return;
    const rect = viewport.getBoundingClientRect();
    const localX = Number.isFinite(clientX) ? Number(clientX) - rect.left : viewport.clientWidth / 2;
    const focus = timelineTimeForX(localX - state.panX, minimumTime, state.daySpacing, SIDE_PADDING);
    state.daySpacing = next;
    renderScaleGeometry();
    state.panX = localX - timelineXForTime(focus, minimumTime, state.daySpacing, SIDE_PADDING);
    applyPan();
    syncControls();
  }

  function fitScale(): void {
    if (!viewport) return;
    const available = Math.max(1, viewport.clientWidth - SIDE_PADDING * 2);
    state.daySpacing = Math.max(MIN_TIMELINE_DAY_SPACING, Math.min(MAX_TIMELINE_DAY_SPACING, available / Math.max(1, rangeDays)));
    state.focusTime = minimumTime + (maximumTime - minimumTime) / 2;
    renderScaleGeometry();
    centerFocus();
    syncControls();
  }

  function resetScale(): void {
    state.daySpacing = baseDaySpacing;
    state.focusTime = maximumTime;
    renderScaleGeometry();
    centerFocus();
    syncControls();
  }

  function renderCurrent(): void {
    refreshData();
    syncControls();
    if (state.mode === "history") renderHistory();
    else renderScale();
  }

  scaleMode.addEventListener("click", () => { if (state.mode !== "scale") { state.mode = "scale"; renderCurrent(); } });
  historyMode.addEventListener("click", () => { if (state.mode !== "history") { state.mode = "history"; renderCurrent(); } });
  for (const [type, button] of typeButtons) {
    button.addEventListener("click", () => {
      if (state.type === type) return;
      state.type = type;
      refreshData(false);
      renderCurrent();
    });
  }
  zoomIn.addEventListener("click", () => setDaySpacing(state.daySpacing * 1.25));
  zoomOut.addEventListener("click", () => setDaySpacing(state.daySpacing / 1.25));
  fit.addEventListener("click", fitScale);
  reset.addEventListener("click", resetScale);

  refreshData(false);
  renderCurrent();

  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => {
      const nextWindowSize = windowSize(root);
      if (nextWindowSize === lastWindowSize) return;
      lastWindowSize = nextWindowSize;
      if (state.mode === "scale") {
        const focus = state.focusTime;
        renderScaleGeometry();
        state.focusTime = focus;
        centerFocus();
      }
    });
    resizeObserver.observe(root);
  }

  return { items: currentItems.length, totalItems: allItems.length, type: state.type, mode: state.mode };
}
