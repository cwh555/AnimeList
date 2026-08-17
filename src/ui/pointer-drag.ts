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
  threshold?: number;
  ghostClass?: string;
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
    if (timeout) view.clearTimeout(timeout);
  };
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
  timeout = view.setTimeout(cleanup, timeoutMs);
}

function createGhost(element: HTMLElement, className: string): HTMLElement {
  const rect = element.getBoundingClientRect();
  const ghost = element.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.classList.add(className);
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);
  return ghost;
}

function positionGhost(ghost: HTMLElement, pointValue: PointerDragPoint): void {
  ghost.style.transform = `translate3d(${Math.round(pointValue.clientX + 12)}px,${Math.round(pointValue.clientY + 12)}px,0)`;
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
    threshold = 5,
    ghostClass = "al-pointer-drag-ghost",
  } = options;
  if (event.button !== 0 && event.pointerType === "mouse") return;

  const pointerId = event.pointerId;
  const start = point(event);
  let started = false;
  let ghost: HTMLElement | null = null;

  const cleanup = (): void => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    try {
      if (captureElement.hasPointerCapture(pointerId)) captureElement.releasePointerCapture(pointerId);
    } catch {
      // The browser may already have released pointer capture.
    }
    ghost?.remove();
    ghost = null;
    dragElement.removeClass("is-pointer-dragging");
  };

  const startDrag = (current: PointerDragPoint): void => {
    started = true;
    ghost = createGhost(dragElement, ghostClass);
    positionGhost(ghost, current);
    dragElement.addClass("is-pointer-dragging");
    onStart?.();
  };

  const move = (moveEvent: PointerEvent): void => {
    if (moveEvent.pointerId !== pointerId) return;
    const current = point(moveEvent);
    if (!started && distanceSquared(start, current) < threshold * threshold) return;
    if (!started) startDrag(current);
    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    if (ghost) positionGhost(ghost, current);
    onMove(current);
  };

  const up = (upEvent: PointerEvent): void => {
    if (upEvent.pointerId !== pointerId) return;
    const current = point(upEvent);
    if (started) {
      upEvent.preventDefault();
      upEvent.stopPropagation();
      // Browsers may emit a click after pointerup even when the drag changed
      // the underlying Markdown and replaced the render child. Suppress that
      // one click at the drop point independently of renderer lifetime.
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

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  try {
    captureElement.setPointerCapture(pointerId);
  } catch {
    // Synthetic tests and some embedded views do not establish capture; window listeners keep the drag active.
  }
}
