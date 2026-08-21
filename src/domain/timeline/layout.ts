export const TIMELINE_DAY_MS = 24 * 60 * 60 * 1000;

export interface TimelineDensityPoint {
  time: number;
  ratio: number;
  density: number;
}

export interface TimelineDensityCurve {
  points: TimelineDensityPoint[];
  bandwidthMs: number;
}

export interface TimelineHistoryMonth<T> {
  year: number;
  month: number;
  items: T[];
}

export interface TimelineHistoryYear<T> {
  year: number;
  months: TimelineHistoryMonth<T>[];
}

export function timelineDayOffset(time: number, minimumTime: number): number {
  return (time - minimumTime) / TIMELINE_DAY_MS;
}

export function timelineXForTime(
  time: number,
  minimumTime: number,
  daySpacing: number,
  sidePadding = 0,
): number {
  return sidePadding + timelineDayOffset(time, minimumTime) * daySpacing;
}

export function timelineTimeForX(
  x: number,
  minimumTime: number,
  daySpacing: number,
  sidePadding = 0,
): number {
  return minimumTime + ((x - sidePadding) / Math.max(daySpacing, Number.EPSILON)) * TIMELINE_DAY_MS;
}

export function timelineTickStepForSpacing(daySpacing: number): number {
  const candidates = [1, 2, 3, 7, 14, 30, 60, 90, 180, 365, 730];
  return candidates.find((step) => step * daySpacing >= 88) ?? 1460;
}

export function formatTimelineDate(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatTimelineDay(time: number): string {
  const date = new Date(time);
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function quantile(sorted: readonly number[], probability: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = Math.max(0, Math.min(1, probability)) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/** Silverman's robust rule-of-thumb bandwidth, with one day as the minimum meaningful width. */
export function timelineDensityBandwidth(times: readonly number[]): number {
  const sorted = times.filter(Number.isFinite).slice().sort((left, right) => left - right);
  if (sorted.length <= 1) return TIMELINE_DAY_MS;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (sorted.length - 1);
  const standardDeviation = Math.sqrt(Math.max(0, variance));
  const interquartileRange = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const robustScale = Math.min(
    standardDeviation || Number.POSITIVE_INFINITY,
    interquartileRange > 0 ? interquartileRange / 1.34 : Number.POSITIVE_INFINITY,
  );
  const fallbackScale = standardDeviation || interquartileRange / 1.34 || TIMELINE_DAY_MS;
  const scale = Number.isFinite(robustScale) && robustScale > 0 ? robustScale : fallbackScale;
  return Math.max(TIMELINE_DAY_MS, 0.9 * scale * sorted.length ** (-1 / 5));
}

/**
 * Gaussian kernel-density estimate sampled across the visible completion-time range.
 * This is a continuous density model, not a histogram with interpolated bar heights.
 */
export function buildTimelineDensityCurve(
  times: readonly number[],
  minimumTime: number,
  maximumTime: number,
  requestedPoints = 256,
): TimelineDensityCurve {
  const finite = times.filter(Number.isFinite);
  if (!finite.length) return { points: [], bandwidthMs: TIMELINE_DAY_MS };
  const range = Math.max(TIMELINE_DAY_MS, maximumTime - minimumTime);
  const pointCount = Math.max(2, Math.min(1024, Math.round(requestedPoints)));
  const bandwidthMs = timelineDensityBandwidth(finite);
  const gaussianNormalization = 1 / Math.sqrt(2 * Math.PI);
  const points = Array.from({ length: pointCount }, (_, index): TimelineDensityPoint => {
    const ratio = index / (pointCount - 1);
    const time = minimumTime + ratio * range;
    let kernelSum = 0;
    for (const sample of finite) {
      const normalized = (time - sample) / bandwidthMs;
      kernelSum += Math.exp(-0.5 * normalized * normalized) * gaussianNormalization;
    }
    return {
      time,
      ratio,
      density: kernelSum / (finite.length * bandwidthMs),
    };
  });
  return { points, bandwidthMs };
}

export function groupTimelineHistory<T extends { completedTime: number }>(items: readonly T[]): TimelineHistoryYear<T>[] {
  const years = new Map<number, Map<number, T[]>>();
  for (const item of items) {
    if (!Number.isFinite(item.completedTime)) continue;
    const date = new Date(item.completedTime);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const months = years.get(year) ?? new Map<number, T[]>();
    const monthItems = months.get(month) ?? [];
    monthItems.push(item);
    months.set(month, monthItems);
    years.set(year, months);
  }
  return [...years.entries()]
    .sort(([left], [right]) => right - left)
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort(([left], [right]) => right - left)
        .map(([month, monthItems]) => ({
          year,
          month,
          items: [...monthItems].sort((left, right) => right.completedTime - left.completedTime),
        })),
    }));
}
