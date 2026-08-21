import type { ReadingProgressUnit } from "../../domain/progress-units";
import { progressUnitFeatureText, progressUnitLabel } from "./text";

export interface TimelineEntryCopy {
  title: string;
  label: string;
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
