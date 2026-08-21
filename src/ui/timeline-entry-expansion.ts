import { buildLibraryCompletionEvents } from "../domain/timeline/completion-events";
import type { MediaItem, TimelineMediaEntry } from "../types";
import { timelineEntryCopy } from "../features/progress/timeline-entry-text";
export { timelineEntryCopy } from "../features/progress/timeline-entry-text";

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
