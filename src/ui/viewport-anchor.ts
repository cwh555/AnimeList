export interface ViewportAnchor {
  restore(): void;
  stabilize(frames?: number): void;
}

function isScrollableY(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  const overflowY = view?.getComputedStyle(element).overflowY ?? "";
  return (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay")
    && element.scrollHeight > element.clientHeight + 1;
}

function findScrollContainer(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;
  while (current) {
    if (current.classList.contains("cm-scroller") || isScrollableY(current)) return current;
    current = current.parentElement;
  }
  const scrolling = element.ownerDocument.scrollingElement;
  return scrolling ? scrolling as HTMLElement : null;
}

export function captureViewportAnchor(element: HTMLElement): ViewportAnchor {
  const view = element.ownerDocument.defaultView;
  const scroller = findScrollContainer(element);
  const top = element.getBoundingClientRect().top;

  const restore = (): void => {
    if (!element.isConnected) return;
    const delta = element.getBoundingClientRect().top - top;
    if (Math.abs(delta) < 0.5) return;
    if (scroller) scroller.scrollTop += delta;
    else view?.scrollBy(0, delta);
  };

  const stabilize = (frames = 10): void => {
    let remaining = Math.max(1, frames);
    const frame = (): void => {
      restore();
      remaining -= 1;
      if (remaining > 0) view?.requestAnimationFrame(frame);
    };
    view?.requestAnimationFrame(frame);
  };

  return { restore, stabilize };
}
