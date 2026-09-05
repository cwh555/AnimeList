import { TIMELINE_DAY_MS } from "./time";

export const TIMELINE_ACTIVITY_WINDOW_DAYS = 14;
export const TIMELINE_ACTIVITY_WINDOW_MS = TIMELINE_ACTIVITY_WINDOW_DAYS * TIMELINE_DAY_MS;

const MAX_UNIFORM_ACTIVITY_POINTS = 8192;

export interface TimelineDensityPoint {
  time: number;
  ratio: number;
  density: number;
}

export interface TimelineDensityCurve {
  points: TimelineDensityPoint[];
  /** Fixed compact-support radius used by the local activity kernel. */
  windowMs: number;
  /** Compatibility alias for callers that previously read the KDE bandwidth. */
  bandwidthMs: number;
}

interface TimelineActivitySample {
  time: number;
  weight: number;
}

function timelineActivitySamples(times: readonly number[]): TimelineActivitySample[] {
  const counts = new Map<number, number>();
  for (const time of times) {
    if (!Number.isFinite(time)) continue;
    counts.set(time, (counts.get(time) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([time, weight]) => ({ time, weight }));
}

function triweightKernel(normalizedDistance: number): number {
  const distance = Math.abs(normalizedDistance);
  if (distance >= 1) return 0;
  const base = 1 - distance * distance;
  return base * base * base;
}

function uniformSampleCount(rangeMs: number, requestedPoints?: number): number {
  const calendarPoints = Math.ceil(rangeMs / TIMELINE_DAY_MS) + 1;
  const requested = requestedPoints === undefined
    ? 0
    : Math.max(0, Math.round(requestedPoints));
  return Math.max(2, Math.min(MAX_UNIFORM_ACTIVITY_POINTS, Math.max(calendarPoints, requested)));
}

function timelineActivitySampleTimes(
  samples: readonly TimelineActivitySample[],
  minimumTime: number,
  maximumTime: number,
  requestedPoints?: number,
): number[] {
  const rangeMs = Math.max(TIMELINE_DAY_MS, maximumTime - minimumTime);
  const endTime = minimumTime + rangeMs;
  const pointCount = uniformSampleCount(rangeMs, requestedPoints);
  const times = new Set<number>();

  for (let index = 0; index < pointCount; index += 1) {
    const ratio = index / (pointCount - 1);
    times.add(minimumTime + ratio * rangeMs);
  }

  // Always sample exact completion dates. This preserves a short burst even
  // when a very long history forces the uniform overview grid above one day.
  for (const sample of samples) {
    if (sample.time < minimumTime || sample.time > endTime) continue;
    times.add(sample.time);
  }

  return [...times].sort((left, right) => left - right);
}

/**
 * Fixed-calendar local activity curve for Timeline overview.
 *
 * Every distinct completion date contributes a compact-support triweight
 * kernel with a 14-day radius. Dates beyond that radius have exactly zero
 * influence, so isolated history cannot broaden or flatten a short burst.
 *
 * The overview samples at least once per day for ordinary date ranges and
 * always includes exact completion dates when a very long history is capped.
 */
export function buildTimelineActivityCurve(
  times: readonly number[],
  minimumTime: number,
  maximumTime: number,
  requestedPoints?: number,
): TimelineDensityCurve {
  const samples = timelineActivitySamples(times);
  if (!samples.length) {
    return {
      points: [],
      windowMs: TIMELINE_ACTIVITY_WINDOW_MS,
      bandwidthMs: TIMELINE_ACTIVITY_WINDOW_MS,
    };
  }

  const rangeMs = Math.max(TIMELINE_DAY_MS, maximumTime - minimumTime);
  const sampleTimes = timelineActivitySampleTimes(samples, minimumTime, maximumTime, requestedPoints);
  const points = sampleTimes.map((time): TimelineDensityPoint => {
    let activity = 0;
    for (const sample of samples) {
      const distance = (time - sample.time) / TIMELINE_ACTIVITY_WINDOW_MS;
      if (Math.abs(distance) >= 1) continue;
      activity += sample.weight * triweightKernel(distance);
    }
    return {
      time,
      ratio: (time - minimumTime) / rangeMs,
      density: activity,
    };
  });

  return {
    points,
    windowMs: TIMELINE_ACTIVITY_WINDOW_MS,
    bandwidthMs: TIMELINE_ACTIVITY_WINDOW_MS,
  };
}

/**
 * Compatibility name used by the existing Timeline renderer.
 * The implementation is an activity curve, not a probability-density KDE.
 */
export const buildTimelineDensityCurve = buildTimelineActivityCurve;
