import {
  defaultProgressUnit,
  isReadingProgressUnit,
} from "./progress-units";
import {
  progressUnitFeatureText,
  progressUnitLabel,
} from "./progress-unit-feature-text";
import type { MediaItem } from "./types";

interface TimelineReadingItem extends Pick<MediaItem, "mediaType" | "unit" | "title"> {}

function readingUnit(item: TimelineReadingItem) {
  const unit = defaultProgressUnit(item.mediaType, item.unit);
  return isReadingProgressUnit(unit) ? unit : null;
}

export function timelineSerialLabel(
  item: TimelineReadingItem,
  label: string,
): string {
  const unit = readingUnit(item);
  if (!unit) return label;
  return progressUnitFeatureText("timelineLabel", {
    label,
    unit: progressUnitLabel(unit),
  });
}

export function timelineSerialEventTitle(
  item: TimelineReadingItem,
  label: string,
): string {
  const unit = readingUnit(item);
  if (!unit) return item.title;
  return progressUnitFeatureText("timelineEventTitle", {
    title: item.title,
    label,
    unit: progressUnitLabel(unit),
  });
}
