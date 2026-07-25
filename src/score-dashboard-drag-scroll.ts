export interface ScoreDashboardDragScrollOptions {
  edgeSize: number;
  minSpeed: number;
  maxSpeed: number;
}

export interface ScoreDashboardDragScrollMetrics {
  pointerY: number;
  viewportTop: number;
  viewportBottom: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export const SCORE_DASHBOARD_DRAG_SCROLL_DEFAULTS: ScoreDashboardDragScrollOptions = {
  edgeSize: 96,
  minSpeed: 2,
  maxSpeed: 22,
};

function normalizedOptions(
  options: Partial<ScoreDashboardDragScrollOptions> = {},
): ScoreDashboardDragScrollOptions {
  const edgeSize = Number.isFinite(options.edgeSize) && (options.edgeSize ?? 0) > 0
    ? Number(options.edgeSize)
    : SCORE_DASHBOARD_DRAG_SCROLL_DEFAULTS.edgeSize;
  const minSpeed = Number.isFinite(options.minSpeed) && (options.minSpeed ?? 0) >= 0
    ? Number(options.minSpeed)
    : SCORE_DASHBOARD_DRAG_SCROLL_DEFAULTS.minSpeed;
  const requestedMax = Number.isFinite(options.maxSpeed)
    ? Number(options.maxSpeed)
    : SCORE_DASHBOARD_DRAG_SCROLL_DEFAULTS.maxSpeed;
  return {
    edgeSize,
    minSpeed,
    maxSpeed: Math.max(minSpeed, requestedMax),
  };
}

function speedForRatio(ratio: number, options: ScoreDashboardDragScrollOptions): number {
  const clamped = Math.min(1, Math.max(0, ratio));
  if (clamped === 0) return 0;
  return options.minSpeed + (options.maxSpeed - options.minSpeed) * clamped * clamped;
}

export function scoreDashboardDragScrollVelocity(
  pointerY: number,
  viewportTop: number,
  viewportBottom: number,
  options: Partial<ScoreDashboardDragScrollOptions> = {},
): number {
  if (![pointerY, viewportTop, viewportBottom].every(Number.isFinite) || viewportBottom <= viewportTop) return 0;
  const resolved = normalizedOptions(options);
  const edgeSize = Math.min(resolved.edgeSize, (viewportBottom - viewportTop) / 2);
  if (edgeSize <= 0) return 0;

  const topRatio = (viewportTop + edgeSize - pointerY) / edgeSize;
  if (topRatio > 0) return -speedForRatio(topRatio, resolved);

  const bottomRatio = (pointerY - (viewportBottom - edgeSize)) / edgeSize;
  if (bottomRatio > 0) return speedForRatio(bottomRatio, resolved);
  return 0;
}

export function scoreDashboardDragScrollDelta(
  metrics: ScoreDashboardDragScrollMetrics,
  options: Partial<ScoreDashboardDragScrollOptions> = {},
): number {
  const values = [
    metrics.pointerY,
    metrics.viewportTop,
    metrics.viewportBottom,
    metrics.scrollTop,
    metrics.scrollHeight,
    metrics.clientHeight,
  ];
  if (!values.every(Number.isFinite)) return 0;

  const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  const currentScrollTop = Math.min(maxScrollTop, Math.max(0, metrics.scrollTop));
  const velocity = scoreDashboardDragScrollVelocity(
    metrics.pointerY,
    metrics.viewportTop,
    metrics.viewportBottom,
    options,
  );
  if (velocity < 0) {
    const available = Math.min(Math.abs(velocity), currentScrollTop);
    return available > 0 ? -available : 0;
  }
  if (velocity > 0) return Math.min(velocity, maxScrollTop - currentScrollTop);
  return 0;
}

export class ScoreDashboardDragAutoScroller {
  private active = false;
  private pointerY: number | null = null;
  private frameId: number | null = null;

  constructor(
    private readonly element: HTMLElement,
    private readonly options: Partial<ScoreDashboardDragScrollOptions> = {},
  ) {}

  start(): void {
    this.active = true;
  }

  update(pointerY: number): void {
    if (!this.active || !Number.isFinite(pointerY)) return;
    this.pointerY = pointerY;
    this.requestFrame();
  }

  stop(): void {
    this.active = false;
    this.pointerY = null;
    const view = this.element.ownerDocument.defaultView;
    if (this.frameId !== null && view) view.cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private requestFrame(): void {
    if (!this.active || this.pointerY === null || this.frameId !== null) return;
    const view = this.element.ownerDocument.defaultView;
    if (!view) return;
    this.frameId = view.requestAnimationFrame(() => this.tick());
  }

  private tick(): void {
    this.frameId = null;
    if (!this.active || this.pointerY === null) return;
    const rect = this.element.getBoundingClientRect();
    const delta = scoreDashboardDragScrollDelta({
      pointerY: this.pointerY,
      viewportTop: rect.top,
      viewportBottom: rect.bottom,
      scrollTop: this.element.scrollTop,
      scrollHeight: this.element.scrollHeight,
      clientHeight: this.element.clientHeight,
    }, this.options);
    if (delta === 0) return;
    this.element.scrollTop += delta;
    this.requestFrame();
  }
}
