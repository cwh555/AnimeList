import { compareTimelineHistoryEntries, type TimelineHistoryOrderable } from "./history-order";

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

function median(values: readonly number[]): number {
  if (!values.length) return TIMELINE_DAY_MS;
  const sorted = [...values].sort((left, right) => left - right);
  return quantile(sorted, 0.5);
}

interface TimelineDensitySample {
  time: number;
  weight: number;
  bandwidth: number;
}

/**
 * Sample-point adaptive bandwidths. Each distinct completion date uses the
 * distance to a nearby neighbor instead of sharing one global bandwidth.
 * Dense bursts therefore keep narrow kernels, while isolated dates receive a
 * wider kernel. Bounds keep the estimate stable for duplicate dates and tails.
 */
export function timelineAdaptiveDensitySamples(times: readonly number[]): TimelineDensitySample[] {
  const counts = new Map<number, number>();
  for (const time of times.filter(Number.isFinite)) counts.set(time, (counts.get(time) ?? 0) + 1);
  const distinct = [...counts.keys()].sort((left, right) => left - right);
  if (!distinct.length) return [];
  if (distinct.length === 1) return [{ time: distinct[0], weight: counts.get(distinct[0]) ?? 1, bandwidth: TIMELINE_DAY_MS }];

  // k-nearest-neighbor density estimators use a neighborhood order that grows
  // with n while remaining o(n). k ~= sqrt(n) satisfies that standard condition
  // and gives this visualization a local, data-adaptive smoothing scale.
  const neighborRank = Math.min(distinct.length - 1, Math.max(1, Math.ceil(Math.sqrt(distinct.length))));
  const globalFallback = timelineDensityBandwidth(distinct);
  const span = Math.max(TIMELINE_DAY_MS, distinct[distinct.length - 1] - distinct[0]);
  const maxBandwidth = Math.max(TIMELINE_DAY_MS, Math.min(span / 4, globalFallback * 4));

  return distinct.map((time) => {
    const distances = distinct
      .filter((candidate) => candidate !== time)
      .map((candidate) => Math.abs(candidate - time))
      .sort((left, right) => left - right);
    const localDistance = distances[Math.min(neighborRank - 1, distances.length - 1)] ?? globalFallback;
    const bandwidth = Math.max(TIMELINE_DAY_MS, Math.min(maxBandwidth, localDistance || globalFallback));
    return { time, weight: counts.get(time) ?? 1, bandwidth };
  });
}

/**
 * Gaussian adaptive kernel-density estimate sampled across the visible range.
 * Bandwidth is local to each distinct completion date rather than one global
 * value, so a dense burst is not blurred by a distant isolated completion.
 */
export function buildTimelineDensityCurve(
  times: readonly number[],
  minimumTime: number,
  maximumTime: number,
  requestedPoints = 256,
): TimelineDensityCurve {
  const samples = timelineAdaptiveDensitySamples(times);
  if (!samples.length) return { points: [], bandwidthMs: TIMELINE_DAY_MS };
  const range = Math.max(TIMELINE_DAY_MS, maximumTime - minimumTime);
  const pointCount = Math.max(2, Math.min(1024, Math.round(requestedPoints)));
  const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
  const gaussianNormalization = 1 / Math.sqrt(2 * Math.PI);
  const points = Array.from({ length: pointCount }, (_, index): TimelineDensityPoint => {
    const ratio = index / (pointCount - 1);
    const time = minimumTime + ratio * range;
    let kernelSum = 0;
    for (const sample of samples) {
      const normalized = (time - sample.time) / sample.bandwidth;
      kernelSum += sample.weight
        * Math.exp(-0.5 * normalized * normalized)
        * gaussianNormalization
        / sample.bandwidth;
    }
    return { time, ratio, density: kernelSum / Math.max(1, totalWeight) };
  });
  return { points, bandwidthMs: median(samples.map((sample) => sample.bandwidth)) };
}

export function groupTimelineHistory<T extends { completedTime: number } & TimelineHistoryOrderable>(items: readonly T[]): TimelineHistoryYear<T>[] {
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
          items: [...monthItems].sort((left, right) => (
            right.completedTime - left.completedTime || compareTimelineHistoryEntries(left, right)
          )),
        })),
    }));
}
