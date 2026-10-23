/** Native scrolling wins until a stationary long press arms a score move. */
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
  identifier: number;
  poster: HTMLButtonElement;
  start: ScoreDashboardTouchPoint;
  timer: number;
  moved: boolean;
  dragging: boolean;
}
export interface ScoreDashboardTouchInteractionAdapters {
  onTouchInput(): void;
  onDragStart(poster: HTMLButtonElement, point: ScoreDashboardTouchPoint): boolean;
  onDragMove(point: ScoreDashboardTouchPoint): void;
  onDragEnd(point: ScoreDashboardTouchPoint, cancelled: boolean): void;
}

function matchingTouch(touches: TouchList, identifier: number): Touch | null {
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches.item(index);
    if (touch?.identifier === identifier) return touch;
  }
  return null;
}

/** Touch Events allow us to cancel native pan only *after* long press.
 * Pointermove alone loses the gesture to pointercancel once the browser pans.
 * Ordinary taps and swipes never call preventDefault().
 */
export function installScoreDashboardTouchInteractions(
  container: HTMLElement, signal: AbortSignal, adapters: ScoreDashboardTouchInteractionAdapters,
): void {
  const view = container.ownerDocument.defaultView;
  if (!view) return;
  let active: ActiveTouchPress | null = null;
  let lastPointerWasTouch = false;
  let suppressClick: HTMLButtonElement | null = null;
  const options = { signal, capture: true } as const;
  const posterAt = (target: EventTarget | null): HTMLButtonElement | null =>
    target instanceof Element ? target.closest<HTMLButtonElement>(".al-score-poster") : null;
  const clear = (cancel = false): void => {
    if (!active) return;
    view.clearTimeout(active.timer);
    if (cancel && active.dragging) adapters.onDragEnd(active.start, true);
    active = null;
  };
  signal.addEventListener("abort", () => clear(true), { once: true });
  view.addEventListener("blur", () => clear(true), options);

  // Preserve hybrid pointer detection, but use Touch Events for the gesture itself.
  container.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") lastPointerWasTouch = false;
    else if (event.pointerType === "touch") {
      lastPointerWasTouch = true;
      adapters.onTouchInput();
    }
  }, options);

  container.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1 || event.changedTouches.length !== 1) {
      clear(true);
      return;
    }
    lastPointerWasTouch = true;
    adapters.onTouchInput();
    clear(true);
    suppressClick = null;
    const poster = posterAt(event.target);
    if (!poster) return;
    const touch = event.changedTouches.item(0);
    if (!touch) return;
    const press: ActiveTouchPress = {
      identifier: touch.identifier, poster, start: { x: touch.clientX, y: touch.clientY },
      timer: 0, moved: false, dragging: false,
    };
    press.timer = view.setTimeout(() => {
      if (active !== press || press.moved) return;
      press.dragging = adapters.onDragStart(press.poster, press.start);
      if (press.dragging) suppressClick = press.poster;
    }, SCORE_DASHBOARD_TOUCH_LONG_PRESS_MS);
    active = press;
  }, { ...options, passive: true });

  container.addEventListener("touchmove", (event) => {
    if (!active) return;
    const touch = matchingTouch(event.changedTouches, active.identifier);
    if (!touch) return;
    const point = { x: touch.clientX, y: touch.clientY };
    if (active.dragging) {
      // The listener is intentionally non-passive only to take ownership of a
      // move after the timer has fired, never during normal scrolling.
      if (event.cancelable) event.preventDefault();
      adapters.onDragMove(point);
    } else if (scoreDashboardTouchIntent(active.start, point) === "scroll") {
      active.moved = true;
      view.clearTimeout(active.timer);
    }
  }, { ...options, passive: false });

  container.addEventListener("touchend", (event) => {
    if (!active) return;
    const touch = matchingTouch(event.changedTouches, active.identifier);
    if (!touch) return;
    if (active.dragging) {
      if (event.cancelable) event.preventDefault();
      adapters.onDragEnd({ x: touch.clientX, y: touch.clientY }, false);
      suppressClick = active.poster;
    } else if (active.moved) suppressClick = active.poster;
    clear();
  }, options);
  container.addEventListener("touchcancel", () => { clear(true); suppressClick = null; }, options);
  container.addEventListener("contextmenu", (event) => {
    if (!lastPointerWasTouch || !posterAt(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }, options);
  container.addEventListener("click", (event) => {
    if (suppressClick && posterAt(event.target) === suppressClick) {
      suppressClick = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, options);
}
