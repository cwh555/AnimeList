import type { ReadingProgressUnit } from "../domain/progress-units";
import { buildLibraryCompletionEvents } from "../domain/timeline/completion-events";
import type { MediaItem, TimelineMediaEntry } from "../types";
import { progressUnitFeatureText, progressUnitLabel } from "../features/progress/text";

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

export function expandTimelineEntries(items: MediaItem[]): TimelineMediaEntry[] {
  return buildLibraryCompletionEvents(items).map((event): TimelineMediaEntry => {
    if (!event.serialEntry || !event.serialUnit) return { ...event.item };
    const copy = timelineEntryCopy(
      event.item.title,
      event.serialEntry.label,
      event.serialUnit,
    );
    return {
      ...event.item,
      seriesTitle: event.item.title,
      title: copy.title,
      serialEntryLabel: copy.label,
      completedAt: event.completedAt,
      cover: event.serialEntry.cover || event.item.cover,
      volumeLabel: event.serialEntry.label,
    };
  });
}
