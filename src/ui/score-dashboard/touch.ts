export const SCORE_DASHBOARD_TOUCH_LONG_PRESS_MS = 450;
export const SCORE_DASHBOARD_TOUCH_DRAG_THRESHOLD_PX = 12;

export type ScoreDashboardTouchIntent = "pending" | "horizontal-scroll" | "drag";

export interface ScoreDashboardTouchPoint {
  x: number;
  y: number;
}

export function scoreDashboardTouchIntent(
  start: ScoreDashboardTouchPoint,
  current: ScoreDashboardTouchPoint,
  threshold = SCORE_DASHBOARD_TOUCH_DRAG_THRESHOLD_PX,
): ScoreDashboardTouchIntent {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance < Math.max(0, threshold)) return "pending";
  return Math.abs(dx) >= Math.abs(dy) ? "horizontal-scroll" : "drag";
}

export function shouldExitScoreDashboardTouchBatchMode(
  touchInputSeen: boolean,
  batchMode: boolean,
  selectedCount: number,
): boolean {
  return touchInputSeen && batchMode && selectedCount <= 0;
}

export interface ScoreDashboardTouchInteractionAdapters {
  selectedPosters(): HTMLButtonElement[];
  onTouchInput(): void;
  finishDrag(): void;
  onDragStart(clientY: number): void;
  onDragMove(clientY: number): void;
  onDrop(paths: readonly string[], lane: HTMLElement): void;
}

interface ActiveTouchGesture {
  pointerId: number;
  poster: HTMLButtonElement;
  start: ScoreDashboardTouchPoint;
  longPressTimer: number;
  longPressed: boolean;
  dragging: boolean;
  cancelledForScroll: boolean;
  paths: string[];
  lane: HTMLElement | null;
}

function isTouchPointer(event: PointerEvent): boolean {
  return event.pointerType === "touch";
}

function selectedPaths(adapters: ScoreDashboardTouchInteractionAdapters): string[] {
  return adapters.selectedPosters()
    .map((poster) => poster.dataset.filePath ?? "")
    .filter(Boolean);
}

export function installScoreDashboardTouchInteractions(
  container: HTMLElement,
  shell: HTMLElement,
  batchButton: HTMLButtonElement,
  signal: AbortSignal,
  adapters: ScoreDashboardTouchInteractionAdapters,
): void {
  const view = container.ownerDocument.defaultView;
  if (!view) return;

  let touchInputSeen = false;
  let active: ActiveTouchGesture | null = null;
  let suppressPosterClick: HTMLButtonElement | null = null;
  let allowProgrammaticClick = false;

  const options = { signal, capture: true } as const;
  const clearLongPress = (gesture: ActiveTouchGesture | null): void => {
    if (gesture) view.clearTimeout(gesture.longPressTimer);
  };
  const clearDropTargets = (): void => {
    container.querySelectorAll<HTMLElement>(".al-score-lane.is-drop-target")
      .forEach((lane) => lane.classList.remove("is-drop-target"));
  };
  const batchMode = (): boolean => shell.classList.contains("is-batch-mode");
  const laneAt = (x: number, y: number): HTMLElement | null => {
    const target = container.ownerDocument.elementFromPoint(x, y);
    return target && container.contains(target) ? target.closest<HTMLElement>(".al-score-lane") : null;
  };
  const updateLane = (gesture: ActiveTouchGesture, x: number, y: number): void => {
    const lane = laneAt(x, y);
    if (gesture.lane === lane) return;
    clearDropTargets();
    gesture.lane = lane;
    lane?.classList.add("is-drop-target");
  };
  const endGesture = (drop: boolean): void => {
    const gesture = active;
    active = null;
    clearLongPress(gesture);
    if (!gesture) return;

    if (gesture.dragging) {
      const lane = gesture.lane;
      adapters.finishDrag();
      if (drop && lane && gesture.paths.length) adapters.onDrop(gesture.paths, lane);
    } else {
      clearDropTargets();
    }
    if (gesture.longPressed || gesture.dragging) suppressPosterClick = gesture.poster;
  };

  const posterTouchAction = "pan-x";
  container.querySelectorAll<HTMLButtonElement>(".al-score-poster")
    .forEach((poster) => { poster.style.touchAction = posterTouchAction; });

  signal.addEventListener("abort", () => {
    clearLongPress(active);
    active = null;
  }, { once: true });

  container.addEventListener("pointerdown", (event) => {
    if (!isTouchPointer(event)) return;
    touchInputSeen = true;
    adapters.onTouchInput();
    const target = event.target;
    const poster = target instanceof Element ? target.closest<HTMLButtonElement>(".al-score-poster") : null;
    if (!poster) return;

    clearLongPress(active);
    const gesture: ActiveTouchGesture = {
      pointerId: event.pointerId,
      poster,
      start: { x: event.clientX, y: event.clientY },
      longPressTimer: 0,
      longPressed: false,
      dragging: false,
      cancelledForScroll: false,
      paths: [],
      lane: null,
    };
    gesture.longPressTimer = view.setTimeout(() => {
      if (active !== gesture || gesture.dragging || gesture.cancelledForScroll) return;
      gesture.longPressed = true;
      allowProgrammaticClick = true;
      if (!batchMode()) batchButton.click();
      if (!gesture.poster.classList.contains("is-selected")) gesture.poster.click();
      allowProgrammaticClick = false;
      suppressPosterClick = gesture.poster;
    }, SCORE_DASHBOARD_TOUCH_LONG_PRESS_MS);
    active = gesture;
  }, options);

  container.addEventListener("pointermove", (event) => {
    const gesture = active;
    if (!gesture || event.pointerId !== gesture.pointerId || !isTouchPointer(event)) return;
    if (gesture.longPressed || gesture.cancelledForScroll) return;

    const intent = scoreDashboardTouchIntent(gesture.start, { x: event.clientX, y: event.clientY });
    if (!gesture.dragging) {
      if (intent === "pending") return;
      clearLongPress(gesture);
      if (intent === "horizontal-scroll") {
        gesture.cancelledForScroll = true;
        return;
      }

      gesture.paths = batchMode()
        ? (gesture.poster.classList.contains("is-selected") ? selectedPaths(adapters) : [])
        : [gesture.poster.dataset.filePath ?? ""].filter(Boolean);
      if (!gesture.paths.length) return;
      gesture.dragging = true;
      suppressPosterClick = gesture.poster;
      gesture.poster.classList.add("is-dragging");
      if (batchMode()) adapters.selectedPosters().forEach((poster) => poster.classList.add("is-batch-dragging"));
      adapters.onDragStart(event.clientY);
    }

    event.preventDefault();
    event.stopPropagation();
    adapters.onDragMove(event.clientY);
    updateLane(gesture, event.clientX, event.clientY);
  }, { ...options, passive: false });

  container.addEventListener("pointerup", (event) => {
    if (!active || event.pointerId !== active.pointerId || !isTouchPointer(event)) return;
    if (active.dragging) {
      event.preventDefault();
      event.stopPropagation();
    }
    endGesture(true);
  }, options);

  container.addEventListener("pointercancel", (event) => {
    if (!active || event.pointerId !== active.pointerId || !isTouchPointer(event)) return;
    endGesture(false);
  }, options);

  container.addEventListener("contextmenu", (event) => {
    if (!touchInputSeen) return;
    const target = event.target;
    const poster = target instanceof Element ? target.closest<HTMLButtonElement>(".al-score-poster") : null;
    if (!poster) return;
    event.preventDefault();
    event.stopPropagation();
  }, options);

  container.addEventListener("click", (event) => {
    if (allowProgrammaticClick) return;
    const target = event.target;
    const poster = target instanceof Element ? target.closest<HTMLButtonElement>(".al-score-poster") : null;
    if (poster && suppressPosterClick === poster) {
      suppressPosterClick = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, options);
}
