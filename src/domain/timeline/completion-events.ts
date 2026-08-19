import type { MediaItem, SerialProgressEntry } from "../media-types";
import {
  defaultProgressUnit,
  isReadingProgressUnit,
  normalizeSerialLog,
  type ReadingProgressUnit,
} from "../progress-units";

export interface LibraryCompletionEvent {
  item: MediaItem;
  completedAt: string;
  startedAt: string;
  serialEntry?: SerialProgressEntry;
  serialUnit?: ReadingProgressUnit;
}

export function buildLibraryCompletionEvents(items: readonly MediaItem[]): LibraryCompletionEvent[] {
  const output: LibraryCompletionEvent[] = [];
  for (const item of items) {
    const unit = defaultProgressUnit(item.mediaType, item.unit);
    if (item.mediaType !== "anime" && isReadingProgressUnit(unit)) {
      const completedSerialEntries = normalizeSerialLog(item.volumeLog, unit)
        .filter((entry) => Boolean(entry.completedAt));
      if (completedSerialEntries.length) {
        for (const entry of completedSerialEntries) {
          output.push({
            item,
            completedAt: entry.completedAt,
            startedAt: entry.startedAt,
            serialEntry: entry,
            serialUnit: unit,
          });
        }
        continue;
      }
    }

    if (item.status === "completed" && item.completedAt) {
      output.push({
        item,
        completedAt: item.completedAt,
        startedAt: item.startedAt,
      });
    }
  }
  return output;
}
