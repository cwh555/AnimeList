export interface LayoutMotionOptions {
  duration?: number;
  easing?: string;
  stagger?: number;
}

interface LayoutBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const DEFAULT_DURATION = 190;
const DEFAULT_EASING = "cubic-bezier(0.2, 0, 0, 1)";

function canMeasure(element: Element): element is HTMLElement {
  return typeof (element as HTMLElement).getBoundingClientRect === "function";
}

function canAnimate(element: Element): element is HTMLElement & { animate: HTMLElement["animate"] } {
  return typeof (element as HTMLElement).animate === "function";
}

function reducedMotion(element: Element): boolean {
  const view = element.ownerDocument?.defaultView;
  return Boolean(view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function boxFor(element: Element): LayoutBox | null {
  if (!canMeasure(element)) return null;
  const rect = element.getBoundingClientRect();
  if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * Runs a FLIP layout transition while preserving the original DOM nodes.
 * The mutation must synchronously place every item at its final DOM/layout
 * position. Only compositor-friendly transform/opacity animation is used.
 */
export function animateLayoutChange(
  elements: Iterable<Element>,
  mutate: () => void,
  options: LayoutMotionOptions = {},
): Promise<void> {
  const nodes = [...elements].filter(canMeasure);
  const first = new Map<Element, LayoutBox>();
  for (const element of nodes) {
    const box = boxFor(element);
    if (box) first.set(element, box);
  }

  mutate();

  if (!nodes.length || !first.size || nodes.some(reducedMotion)) return Promise.resolve();
  const duration = Math.max(0, options.duration ?? DEFAULT_DURATION);
  const easing = options.easing ?? DEFAULT_EASING;
  const stagger = Math.max(0, options.stagger ?? 0);
  const animations: Animation[] = [];

  nodes.forEach((element, index) => {
    const before = first.get(element);
    const after = boxFor(element);
    if (!before || !after || !canAnimate(element)) return;
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    const sx = after.width > 0 ? before.width / after.width : 1;
    const sy = after.height > 0 ? before.height / after.height : 1;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) return;

    element.dataset.layoutMotion = "active";
    const animation = element.animate(
      [
        { transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transformOrigin: "top left", transform: "translate(0, 0) scale(1, 1)" },
      ],
      { duration, easing, delay: index * stagger, fill: "both" },
    );
    animations.push(animation);
    const clear = (): void => {
      delete element.dataset.layoutMotion;
      try { animation.cancel(); } catch { /* detached element */ }
    };
    animation.finished.then(clear, clear);
  });

  return Promise.allSettled(animations.map((animation) => animation.finished)).then(() => undefined);
}

/**
 * Smooths a true surface replacement without replacing the surrounding app
 * surface. Correctness never depends on animation support.
 */
export function transitionSurface(container: HTMLElement, mutate: () => void): void {
  mutate();
  if (reducedMotion(container) || !canAnimate(container)) return;
  container.dataset.surfaceMotion = "active";
  const animation = container.animate(
    [{ opacity: 0.94 }, { opacity: 1 }],
    { duration: 120, easing: DEFAULT_EASING },
  );
  const clear = (): void => {
    delete container.dataset.surfaceMotion;
    try { animation.cancel(); } catch { /* detached surface */ }
  };
  animation.finished.then(clear, clear);
}
