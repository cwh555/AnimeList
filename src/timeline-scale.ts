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
  let maximum = 0;
  let currentTime: number | null = null;
  let currentCount = 0;

  for (const time of sortedCompletedTimes) {
    if (!Number.isFinite(time)) continue;
    if (time === currentTime) {
      currentCount += 1;
    } else {
      currentTime = time;
      currentCount = 1;
    }
    maximum = Math.max(maximum, currentCount);
  }

  return maximum;
}

/**
 * Calculates the minimum practical default spacing without iterative layout
 * searches. Every work remains part of the density calculation, including
 * multiple works completed on the same day.
 *
 * Same-day works cannot be separated by time scaling, so their maximum count is
 * treated as the unavoidable lane baseline. The effective lane limit is the
 * larger of that baseline and the configured two-sided capacity
 * (`2 * maxStackDepth`). For every consecutive window of one more work than the
 * effective limit, the required spacing follows directly from the first and
 * last completion dates. This ensures that a work on a later date cannot add a
 * new lane above the unavoidable same-day stack.
 *
 * A four-percent margin absorbs pixel rounding without noticeably spreading
 * the timeline.
 */
export function calculateDefaultTimelineDaySpacing(
  sortedCompletedTimes: readonly number[],
  rangeDays: number,
  maxStackDepth: number,
): number {
  const configuredLaneLimit = normalizeTimelineMaxStackDepth(maxStackDepth) * 2;
  const laneLimit = Math.max(
    configuredLaneLimit,
    maximumSameDayCount(sortedCompletedTimes),
  );
  let densitySpacing = MIN_TIMELINE_DAY_SPACING;

  for (
    let index = 0;
    index + laneLimit < sortedCompletedTimes.length;
    index += 1
  ) {
    const first = sortedCompletedTimes[index];
    const last = sortedCompletedTimes[index + laneLimit];
    if (!Number.isFinite(first) || !Number.isFinite(last)) continue;
    const spanDays = (last - first) / DAY_MS;
    if (spanDays <= 0) continue;
    densitySpacing = Math.max(
      densitySpacing,
      (CARD_DISTANCE * DEFAULT_SPACING_SAFETY) / spanDays,
    );
  }

  return clamp(
    Math.max(rangeBasedDaySpacing(Math.max(1, rangeDays)), densitySpacing),
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
