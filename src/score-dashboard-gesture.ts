export type ScoreDashboardWheelIntent = "scroll" | "zoom";

export interface ScoreDashboardWheelLike {
  ctrlKey: boolean;
  deltaY: number;
}

export const SCORE_DASHBOARD_WHEEL_ZOOM_SENSITIVITY = 0.002;

export function scoreDashboardWheelIntent(
  event: Pick<ScoreDashboardWheelLike, "ctrlKey">,
): ScoreDashboardWheelIntent {
  return event.ctrlKey ? "zoom" : "scroll";
}

export function clampContinuousScoreDashboardScale(
  value: unknown,
  minScale: number,
  maxScale: number,
  fallbackScale: number,
): number {
  const parsed = Number(value);
  const fallback = Number.isFinite(fallbackScale) ? fallbackScale : minScale;
  const next = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(maxScale, Math.max(minScale, next));
}

export function scoreDashboardScaleFromWheel(
  currentScale: number,
  deltaY: number,
  minScale: number,
  maxScale: number,
): number {
  const current = clampContinuousScoreDashboardScale(currentScale, minScale, maxScale, minScale);
  if (!Number.isFinite(deltaY) || deltaY === 0) return current;
  const next = current * Math.exp(-deltaY * SCORE_DASHBOARD_WHEEL_ZOOM_SENSITIVITY);
  return Math.round(clampContinuousScoreDashboardScale(next, minScale, maxScale, current) * 100) / 100;
}

export function preserveScoreDashboardAnchorScrollTop(
  currentScrollTop: number,
  previousAnchorTop: number,
  nextAnchorTop: number,
): number {
  const values = [currentScrollTop, previousAnchorTop, nextAnchorTop];
  if (!values.every((value) => Number.isFinite(value))) return currentScrollTop;
  return Math.max(0, currentScrollTop + nextAnchorTop - previousAnchorTop);
}
