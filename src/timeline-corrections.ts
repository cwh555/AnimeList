import {
  progressUnitFeatureText,
  progressUnitLabel,
} from "./progress-unit-feature-text";
import type { ReadingProgressUnit } from "./progress-units";
import { normalizeTimelineMaxStackDepth } from "./timeline-scale";

export interface TimelineLanePlacement {
  anchorX: number;
  x: number;
  lane: number;
}

export interface TimelinePan {
  x: number;
  y: number;
}

export interface TimelineEntryCopy {
  title: string;
  label: string;
}

/**
 * Produces the default timeline card placement while respecting the configured
 * per-side stack depth. Cards keep their real date as `anchorX`; when every
 * configured lane is occupied, only the visual card position is moved to the
 * next available point in the earliest reusable lane.
 */
export function layoutDefaultTimelinePoints(
  anchorXs: readonly number[],
  minimumDistance: number,
  maxStackDepth: number,
): TimelineLanePlacement[] {
  const laneLimit = normalizeTimelineMaxStackDepth(maxStackDepth) * 2;
  const safeDistance = Number.isFinite(minimumDistance) && minimumDistance > 0
    ? minimumDistance
    : 1;
  const laneEnds: number[] = [];

  return anchorXs.map((rawAnchorX) => {
    const anchorX = Number.isFinite(rawAnchorX) ? rawAnchorX : 0;
    let x = anchorX;
    let lane = laneEnds.findIndex((lastX) => anchorX - lastX >= safeDistance);

    if (lane < 0 && laneEnds.length < laneLimit) {
      lane = laneEnds.length;
    } else if (lane < 0) {
      lane = laneEnds.reduce((earliestLane, lastX, candidateLane) => (
        lastX < laneEnds[earliestLane] ? candidateLane : earliestLane
      ), 0);
      x = Math.max(anchorX, laneEnds[lane] + safeDistance);
    }

    laneEnds[lane] = x;
    return { anchorX, x, lane };
  });
}

/** Centers the newest card horizontally while keeping the timeline axis vertical center. */
export function centerLatestTimelineAxis(
  viewportWidth: number,
  viewportHeight: number,
  latestCardCenterX: number,
  axisY: number,
  viewScale: number,
): TimelinePan {
  return {
    x: viewportWidth / 2 - latestCardCenterX * viewScale,
    y: viewportHeight / 2 - axisY * viewScale,
  };
}

export function timelineEntryCopy(
  seriesTitle: string,
  entryLabel: string,
  unit: ReadingProgressUnit,
): TimelineEntryCopy {
  const unitLabel = progressUnitLabel(unit);
  return {
    title: progressUnitFeatureText("timelineEntryTitle", {
      title: seriesTitle,
      label: entryLabel,
      unit: unitLabel,
    }),
    label: progressUnitFeatureText("timelineEntryLabel", {
      label: entryLabel,
      unit: unitLabel,
    }),
  };
}
