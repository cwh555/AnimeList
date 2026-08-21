export const TIMELINE_DAY_MS = 24 * 60 * 60 * 1000;

export interface TimelineDensityBin {
  startTime: number;
  endTime: number;
  count: number;
  ratioStart: number;
  ratioEnd: number;
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

export function buildTimelineDensity(
  times: readonly number[],
  minimumTime: number,
  maximumTime: number,
  requestedBins = 48,
): TimelineDensityBin[] {
  const finite = times.filter(Number.isFinite);
  if (!finite.length) return [];
  const range = Math.max(TIMELINE_DAY_MS, maximumTime - minimumTime);
  const binCount = Math.max(1, Math.min(requestedBins, Math.ceil(range / TIMELINE_DAY_MS) + 1));
  const binWidth = range / binCount;
  const counts = Array.from({ length: binCount }, () => 0);
  for (const time of finite) {
    const normalized = Math.min(0.999999999, Math.max(0, (time - minimumTime) / range));
    counts[Math.floor(normalized * binCount)] += 1;
  }
  return counts.map((count, index) => ({
    startTime: minimumTime + index * binWidth,
    endTime: minimumTime + (index + 1) * binWidth,
    count,
    ratioStart: index / binCount,
    ratioEnd: (index + 1) / binCount,
  }));
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
