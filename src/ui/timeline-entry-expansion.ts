import { normalizeVolumeLog } from "../domain/progress/novel-progress";
import { defaultProgressUnit, type ReadingProgressUnit } from "../domain/progress-units";
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
  const output: TimelineMediaEntry[] = [];
  for (const item of items) {
    const completedVolumes = item.mediaType === "novel" || item.mediaType === "manga"
      ? normalizeVolumeLog(item.volumeLog).filter((entry) => Boolean(entry.completedAt))
      : [];
    if (completedVolumes.length) {
      for (const volume of completedVolumes) {
        const unit = defaultProgressUnit(item.mediaType, item.unit);
        const copy = timelineEntryCopy(
          item.title,
          volume.label,
          unit === "episode" ? "volume" : unit,
        );
        output.push({
          ...item,
          seriesTitle: item.title,
          title: copy.title,
          serialEntryLabel: copy.label,
          completedAt: volume.completedAt,
          cover: volume.cover || item.cover,
          volumeLabel: volume.label,
        });
      }
      continue;
    }
    if (item.status === "completed" && item.completedAt) output.push({ ...item });
  }
  return output;
}
