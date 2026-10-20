/** Shared Timeline pan interaction for the modal and full-page workspace.
 * The first movement is deliberately not captured: a tap on a poster must
 * still dispatch its normal click. Once movement passes the threshold, the
 * gesture belongs to the canvas even when it started over a poster.
 */
export interface TimelinePanPosition { x: number; y: number }

export interface TimelinePanAdapters {
  position(): TimelinePanPosition;
  panTo(x: number, y: number): void;
}

export const TIMELINE_PAN_START_THRESHOLD_PX = 6;

export function installTimelinePointerPan(viewport: HTMLElement, adapters: TimelinePanAdapters): void {
  const view = viewport.ownerDocument?.defaultView;
  if (!view) return;

  interface Gesture {
    pointerId: number;
    x: number;
    y: number;
    origin: TimelinePanPosition;
    dragging: boolean;
  }
  let active: Gesture | null = null;
  let pending: TimelinePanPosition | null = null;
  let frame = 0;
  let suppressClick = false;

  const flush = (): void => {
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
    if (!pending) return;
    const next = pending;
    pending = null;
    adapters.panTo(next.x, next.y);
  };
  const release = (): void => {
    const gesture = active;
    if (!gesture) return;
    active = null;
    viewport.classList.remove("is-dragging");
    if (gesture.dragging) {
      flush();
      try {
        if (viewport.hasPointerCapture(gesture.pointerId)) viewport.releasePointerCapture(gesture.pointerId);
      } catch {
        // Capture may have been released by the browser already.
      }
    } else {
      pending = null;
    }
  };

  viewport.addEventListener("pointerdown", (event) => {
    if (active || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
    // A separate pointerdown means that any delayed click from a prior pan is
    // no longer the click we intended to suppress.
    suppressClick = false;
    active = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      origin: adapters.position(),
      dragging: false,
    };
  });

  viewport.addEventListener("pointermove", (event) => {
    const gesture = active;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragging && Math.hypot(dx, dy) < TIMELINE_PAN_START_THRESHOLD_PX) return;
    if (!gesture.dragging) {
      gesture.dragging = true;
      viewport.classList.add("is-dragging");
      try {
        viewport.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointer input may not establish pointer capture.
      }
    }
    event.preventDefault();
    pending = { x: gesture.origin.x + dx, y: gesture.origin.y + dy };
    if (!frame) {
      frame = view.requestAnimationFrame(() => {
        frame = 0;
        if (pending) {
          const next = pending;
          pending = null;
          adapters.panTo(next.x, next.y);
        }
      });
    }
  });

  viewport.addEventListener("pointerup", (event) => {
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.dragging) {
      suppressClick = true;
      event.preventDefault();
    }
    release();
  });
  viewport.addEventListener("pointercancel", (event) => {
    if (active?.pointerId !== event.pointerId) return;
    pending = null;
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
    release();
  });
  viewport.addEventListener("lostpointercapture", (event) => {
    // Touch starts with implicit capture on a descendant (often a poster).
    // Its lostpointercapture bubbles through this viewport when capture moves
    // to the viewport. Only release on capture loss from the viewport itself.
    if (event.target === viewport && active?.pointerId === event.pointerId) release();
  });

  // Dragging a poster must not also open its note on release.
  viewport.addEventListener("click", (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
