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

interface TimelineLaneAssignment {
  day: number;
  lane: number;
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

function assignTimelineLanes(
  completedTimes: readonly number[],
  daySpacing: number,
): TimelineLaneAssignment[] {
  const times = finiteSortedTimes(completedTimes);
  if (!times.length) return [];
  const minimumTime = times[0];
  const laneEnds: number[] = [];

  return times.map((time) => {
    const day = dayOffset(time, minimumTime);
    const x = day * daySpacing;
    let lane = laneEnds.findIndex((lastX) => x - lastX >= CARD_DISTANCE);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = x;
    return { day, lane };
  });
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

/**
 * Runs the same greedy horizontal collision layout used by the timeline UI.
 */
export function calculateTimelineLaneCount(
  completedTimes: readonly number[],
  daySpacing: number,
): number {
  const assignments = assignTimelineLanes(completedTimes, daySpacing);
  return assignments.reduce((maximum, assignment) => (
    Math.max(maximum, assignment.lane + 1)
  ), 0);
}

/**
 * Verifies the configured initialization depth per completion date. Same-day
 * records are the only local exception: a date with more records than the
 * configured two-sided capacity may use exactly the lanes it inherently needs,
 * but that exception must not raise the permitted stack depth for other dates.
 */
export function timelineLayoutRespectsInitialStackDepth(
  completedTimes: readonly number[],
  daySpacing: number,
  maxStackDepth: number,
): boolean {
  const configuredLaneLimit = normalizeTimelineMaxStackDepth(maxStackDepth) * 2;
  const assignments = assignTimelineLanes(completedTimes, daySpacing);
  const dateGroups = new Map<number, number[]>();

  for (const assignment of assignments) {
    const lanes = dateGroups.get(assignment.day) ?? [];
    lanes.push(assignment.lane);
    dateGroups.set(assignment.day, lanes);
  }

  for (const lanes of dateGroups.values()) {
    const allowedLaneCount = Math.max(configuredLaneLimit, lanes.length);
    const usedLaneCount = Math.max(...lanes) + 1;
    if (usedLaneCount > allowedLaneCount) return false;
  }

  return true;
}

/**
 * Calculates the initial/reset date spacing by validating the actual greedy
 * lane assignment. The setting controls the initial stack on every date;
 * unavoidable same-day overflow stays local to that date instead of globally
 * relaxing the stack-depth target for unrelated parts of the timeline.
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

  if (timelineLayoutRespectsInitialStackDepth(times, baseline, maxStackDepth)) {
    return baseline;
  }
  if (!timelineLayoutRespectsInitialStackDepth(
    times,
    MAX_TIMELINE_DAY_SPACING,
    maxStackDepth,
  )) {
    return MAX_TIMELINE_DAY_SPACING;
  }

  let lower = baseline;
  let upper = MAX_TIMELINE_DAY_SPACING;
  for (let step = 0; step < LAYOUT_SEARCH_STEPS; step += 1) {
    const candidate = (lower + upper) / 2;
    if (timelineLayoutRespectsInitialStackDepth(times, candidate, maxStackDepth)) {
      upper = candidate;
    } else {
      lower = candidate;
    }
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
