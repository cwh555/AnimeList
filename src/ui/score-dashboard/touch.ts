/** Touch is for browsing; a stationary long press selects for explicit score edits. */
export const SCORE_DASHBOARD_TOUCH_LONG_PRESS_MS = 450;
export const SCORE_DASHBOARD_TOUCH_SCROLL_TOLERANCE_PX = 10;
export type ScoreDashboardTouchIntent = "pending" | "scroll";
export interface ScoreDashboardTouchPoint { x: number; y: number }

export function scoreDashboardTouchIntent(start: ScoreDashboardTouchPoint, current: ScoreDashboardTouchPoint,
  tolerance = SCORE_DASHBOARD_TOUCH_SCROLL_TOLERANCE_PX): ScoreDashboardTouchIntent {
  return Math.hypot(current.x - start.x, current.y - start.y) >= Math.max(0, tolerance) ? "scroll" : "pending";
}
export function shouldExitScoreDashboardTouchBatchMode(touchInputSeen: boolean, batchMode: boolean, selectedCount: number): boolean {
  return touchInputSeen && batchMode && selectedCount <= 0;
}
interface ActiveTouchPress {
  pointerId: number;
  poster: HTMLButtonElement;
  start: ScoreDashboardTouchPoint;
  timer: number;
  moved: boolean;
  longPressed: boolean;
}
export interface ScoreDashboardTouchInteractionAdapters { onTouchInput(): void }

export function installScoreDashboardTouchInteractions(
  container: HTMLElement, shell: HTMLElement, batchButton: HTMLButtonElement, signal: AbortSignal,
  adapters: ScoreDashboardTouchInteractionAdapters,
): void {
  const view = container.ownerDocument.defaultView;
  if (!view) return;
  let active: ActiveTouchPress | null = null;
  let lastPointerWasTouch = false;
  let suppressClick: HTMLButtonElement | null = null;
  let programmaticClick = false;
  const options = { signal, capture: true } as const;
  const posterAt = (target: EventTarget | null): HTMLButtonElement | null =>
    target instanceof Element ? target.closest<HTMLButtonElement>(".al-score-poster") : null;
  const clear = (): void => {
    if (active) view.clearTimeout(active.timer);
    active = null;
  };
  signal.addEventListener("abort", clear, { once: true });

  container.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") {
      lastPointerWasTouch = false;
      return;
    }
    if (event.pointerType !== "touch" || event.isPrimary === false) return;
    lastPointerWasTouch = true;
    adapters.onTouchInput();
    suppressClick = null;
    clear();
    const poster = posterAt(event.target);
    if (!poster) return;
    const press: ActiveTouchPress = {
      pointerId: event.pointerId, poster, start: { x: event.clientX, y: event.clientY },
      timer: 0, moved: false, longPressed: false,
    };
    press.timer = view.setTimeout(() => {
      if (active !== press || press.moved) return;
      press.longPressed = true;
      programmaticClick = true;
      try {
        if (!shell.classList.contains("is-batch-mode")) batchButton.click();
        if (!poster.classList.contains("is-selected")) poster.click();
      } finally {
        programmaticClick = false;
      }
      suppressClick = poster;
    }, SCORE_DASHBOARD_TOUCH_LONG_PRESS_MS);
    active = press;
  }, options);

  container.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "touch" || active?.pointerId !== event.pointerId) return;
    if (scoreDashboardTouchIntent(active.start, { x: event.clientX, y: event.clientY }) === "scroll") {
      active.moved = true;
      view.clearTimeout(active.timer);
    }
    // No preventDefault: let the browser handle both horizontal and vertical swipes.
  }, options);
  container.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch" || active?.pointerId !== event.pointerId) return;
    if (active.moved || active.longPressed) suppressClick = active.poster;
    clear();
  }, options);
  container.addEventListener("pointercancel", (event) => {
    if (event.pointerType === "touch" && active?.pointerId === event.pointerId) clear();
  }, options);
  container.addEventListener("contextmenu", (event) => {
    if (!lastPointerWasTouch || !posterAt(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }, options);
  container.addEventListener("click", (event) => {
    if (programmaticClick) return;
    if (suppressClick && posterAt(event.target) === suppressClick) {
      suppressClick = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, options);
}
