export const DEFAULT_TIMELINE_MAX_STACK_DEPTH = 3;
export const MIN_TIMELINE_MAX_STACK_DEPTH = 1;
export const MAX_TIMELINE_MAX_STACK_DEPTH = 10;
export const MIN_TIMELINE_DAY_SPACING = 0.18;
export const MAX_TIMELINE_DAY_SPACING = 144;
export const MIN_TIMELINE_VIEW_SCALE = 0.1;
export const MAX_TIMELINE_VIEW_SCALE = 1.6;
export const DEFAULT_TIMELINE_VIEW_SCALE = 1;

const DAY_MS = 24 * 60 * 60 * 1000;
const CARD_DISTANCE = 120 + 16;
const DEFAULT_SPACING_SAFETY = 1.04;
const LAYOUT_SEARCH_STEPS = 48;

export interface TimelineDefaultView {
  daySpacing: number;
  viewScale: number;
}

export interface TimelinePan {
  x: number;
  y: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rangeBasedDaySpacing(rangeDays: number): number {
  if (rangeDays <= 21) return 34;
  if (rangeDays <= 60) return 18;
  if (rangeDays <= 120) return 11;
  if (rangeDays <= 365) return 6;
  if (rangeDays <= 730) return 3.5;
  if (rangeDays <= 1825) return 2;
  return 1.15;
}

function finiteSortedTimes(completedTimes: readonly number[]): number[] {
  return completedTimes
    .filter(Number.isFinite)
    .slice()
    .sort((left, right) => left - right);
}

function dayOffset(time: number, minimumTime: number): number {
  return Math.round((time - minimumTime) / DAY_MS);
}

export function normalizeTimelineMaxStackDepth(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMELINE_MAX_STACK_DEPTH;
  return clamp(
    Math.round(parsed),
    MIN_TIMELINE_MAX_STACK_DEPTH,
    MAX_TIMELINE_MAX_STACK_DEPTH,
  );
}

function maximumSameDayCount(sortedCompletedTimes: readonly number[]): number {
  const times = finiteSortedTimes(sortedCompletedTimes);
  if (!times.length) return 0;
  const minimumTime = times[0];
  let maximum = 0;
  let currentDay: number | null = null;
  let currentCount = 0;

  for (const time of times) {
    const day = dayOffset(time, minimumTime);
    if (day === currentDay) {
      currentCount += 1;
    } else {
      currentDay = day;
      currentCount = 1;
    }
    maximum = Math.max(maximum, currentCount);
  }

  return maximum;
}

/**
 * Runs the same greedy horizontal collision layout used by the timeline UI.
 * This keeps default-spacing validation tied to the rendered behavior instead
 * of relying on an approximation that can miss mixed same-day and nearby-date
 * groups.
 */
export function calculateTimelineLaneCount(
  completedTimes: readonly number[],
  daySpacing: number,
): number {
  const times = finiteSortedTimes(completedTimes);
  if (!times.length) return 0;
  const minimumTime = times[0];
  const laneEnds: number[] = [];

  for (const time of times) {
    const x = dayOffset(time, minimumTime) * daySpacing;
    let lane = laneEnds.findIndex((lastX) => x - lastX >= CARD_DISTANCE);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = x;
  }

  return laneEnds.length;
}

/**
 * Calculates the initial/reset date spacing by validating the actual greedy
 * lane assignment. The configured value remains an initialization target, not
 * a runtime hard cap: unavoidable same-day records may exceed it, while records
 * on later dates must reuse the available lanes instead of extending the stack.
 */
export function calculateDefaultTimelineDaySpacing(
  sortedCompletedTimes: readonly number[],
  rangeDays: number,
  maxStackDepth: number,
): number {
  const times = finiteSortedTimes(sortedCompletedTimes);
  const baseline = clamp(
    rangeBasedDaySpacing(Math.max(1, rangeDays)),
    MIN_TIMELINE_DAY_SPACING,
    MAX_TIMELINE_DAY_SPACING,
  );
  if (!times.length) return baseline;

  const laneLimit = Math.max(
    normalizeTimelineMaxStackDepth(maxStackDepth) * 2,
    maximumSameDayCount(times),
  );
  if (calculateTimelineLaneCount(times, baseline) <= laneLimit) return baseline;
  if (calculateTimelineLaneCount(times, MAX_TIMELINE_DAY_SPACING) > laneLimit) {
    return MAX_TIMELINE_DAY_SPACING;
  }

  let lower = baseline;
  let upper = MAX_TIMELINE_DAY_SPACING;
  for (let step = 0; step < LAYOUT_SEARCH_STEPS; step += 1) {
    const candidate = (lower + upper) / 2;
    if (calculateTimelineLaneCount(times, candidate) <= laneLimit) upper = candidate;
    else lower = candidate;
  }

  return clamp(
    upper * DEFAULT_SPACING_SAFETY,
    MIN_TIMELINE_DAY_SPACING,
    MAX_TIMELINE_DAY_SPACING,
  );
}

export function preserveTimelineAxisScreenY(
  panY: number,
  previousAxisY: number,
  nextAxisY: number,
  viewScale: number,
): number {
  return panY + (previousAxisY - nextAxisY) * viewScale;
}

export function centerTimelinePoint(
  viewportWidth: number,
  viewportHeight: number,
  pointX: number,
  pointY: number,
  viewScale: number,
): TimelinePan {
  return {
    x: viewportWidth / 2 - pointX * viewScale,
    y: viewportHeight / 2 - pointY * viewScale,
  };
}

export function centerTimelineLatestDateAndAxis(
  viewportWidth: number,
  viewportHeight: number,
  latestDateX: number,
  axisY: number,
  viewScale: number,
): TimelinePan {
  return {
    x: viewportWidth / 2 - latestDateX * viewScale,
    y: viewportHeight / 2 - axisY * viewScale,
  };
}

export function calculateDefaultTimelineView(
  sortedCompletedTimes: readonly number[],
  rangeDays: number,
  maxStackDepth: number,
): TimelineDefaultView {
  return {
    daySpacing: calculateDefaultTimelineDaySpacing(
      sortedCompletedTimes,
      rangeDays,
      maxStackDepth,
    ),
    viewScale: DEFAULT_TIMELINE_VIEW_SCALE,
  };
}
