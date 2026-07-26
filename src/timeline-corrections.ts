import {
  progressUnitFeatureText,
  progressUnitLabel,
} from "./progress-unit-feature-text";
import type { ReadingProgressUnit } from "./progress-units";

export interface TimelinePan {
  x: number;
  y: number;
}

export interface TimelineEntryCopy {
  title: string;
  label: string;
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
