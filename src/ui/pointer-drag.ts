export interface PointerDragPoint {
  clientX: number;
  clientY: number;
  pointerType: string;
}

export interface PointerDragOptions {
  event: PointerEvent;
  captureElement: HTMLElement;
  dragElement: HTMLElement;
  onMove: (point: PointerDragPoint) => void;
  onDrop: (point: PointerDragPoint) => void;
  onCancel?: () => void;
  onStart?: () => void;
  onArm?: () => void;
  onFinish?: () => void;
  threshold?: number;
  signal?: AbortSignal;
}

function point(event: PointerEvent): PointerDragPoint {
  return { clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType };
}

function distanceSquared(left: PointerDragPoint, right: PointerDragPoint): number {
  const dx = left.clientX - right.clientX;
  const dy = left.clientY - right.clientY;
  return dx * dx + dy * dy;
}

function suppressSyntheticClick(pointValue: PointerDragPoint, timeoutMs = 500, radius = 32): void {
  const view = window;
  const deadline = performance.now() + timeoutMs;
  const radiusSquared = radius * radius;
  let timeout = 0;

  const cleanup = (): void => {
    view.removeEventListener("click", block, true);
    view.removeEventListener("pointerdown", releaseForNextPointer, true);
    if (timeout) view.clearTimeout(timeout);
  };
  const releaseForNextPointer = (): void => cleanup();
  const block = (event: MouseEvent): void => {
    if (performance.now() > deadline) {
      cleanup();
      return;
    }
    const clickPoint = { clientX: event.clientX, clientY: event.clientY, pointerType: "click" };
    if (distanceSquared(pointValue, clickPoint) > radiusSquared) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    cleanup();
  };

  view.addEventListener("click", block, true);
  view.addEventListener("pointerdown", releaseForNextPointer, true);
  timeout = view.setTimeout(cleanup, timeoutMs);
}

export function armPointerDrag(options: PointerDragOptions): void {
  const {
    event,
    captureElement,
    dragElement,
    onMove,
    onDrop,
    onCancel,
    onStart,
    onArm,
    onFinish,
    threshold = 5,
    signal,
  } = options;
  if (event.button !== 0 && event.pointerType === "mouse") return;
  if (signal?.aborted) return;

  const pointerId = event.pointerId;
  const start = point(event);
  onArm?.();
  let started = false;
  let finished = false;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    onFinish?.();
  };

  const cleanup = (): void => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    signal?.removeEventListener("abort", abort);
    try {
      if (captureElement.hasPointerCapture(pointerId)) captureElement.releasePointerCapture(pointerId);
    } catch {
      // The browser may already have released pointer capture.
    }
    dragElement.removeClass("is-pointer-dragging");
    finish();
  };

  const abort = (): void => {
    if (started) onCancel?.();
    cleanup();
  };

  const startDrag = (): void => {
    started = true;
    dragElement.addClass("is-pointer-dragging");
    onStart?.();
  };

  const move = (moveEvent: PointerEvent): void => {
    if (moveEvent.pointerId !== pointerId) return;
    const current = point(moveEvent);
    if (!started && distanceSquared(start, current) < threshold * threshold) return;
    if (!started) startDrag();
    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    onMove(current);
  };

  const up = (upEvent: PointerEvent): void => {
    if (upEvent.pointerId !== pointerId) return;
    const current = point(upEvent);
    if (started) {
      upEvent.preventDefault();
      upEvent.stopPropagation();
      suppressSyntheticClick(current);
      onDrop(current);
    }
    cleanup();
  };

  const cancel = (cancelEvent: PointerEvent): void => {
    if (cancelEvent.pointerId !== pointerId) return;
    if (started) onCancel?.();
    cleanup();
  };

  signal?.addEventListener("abort", abort, { once: true });
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  try {
    captureElement.setPointerCapture(pointerId);
  } catch {
    // Synthetic tests and some embedded views do not establish capture; window listeners keep the drag active.
  }
}
