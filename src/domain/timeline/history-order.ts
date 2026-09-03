import { compareMediaTitlesByInstallment } from "../media-title-sort";
import { compareVolumeLabels, normalizeVolumeLabel } from "../progress/novel-progress";

export interface TimelineHistoryOrderable {
  title?: string | null;
  seriesTitle?: string | null;
  volumeLabel?: string | null;
}

/**
 * Timeline History is newest-first. Different works keep locale-aware base-title
 * order, while explicit installments of the same work use descending season /
 * part / volume numbers. Structured serial-log labels take precedence over
 * reparsing the rendered title.
 */
export function compareTimelineHistoryEntries(
  left: TimelineHistoryOrderable,
  right: TimelineHistoryOrderable,
): number {
  const leftSeries = String(left.seriesTitle || left.title || "");
  const rightSeries = String(right.seriesTitle || right.title || "");
  const seriesOrder = compareMediaTitlesByInstallment(leftSeries, rightSeries, "desc");
  if (seriesOrder) return seriesOrder;

  const leftVolume = normalizeVolumeLabel(left.volumeLabel);
  const rightVolume = normalizeVolumeLabel(right.volumeLabel);
  if (leftVolume && rightVolume) {
    const volumeOrder = compareVolumeLabels(leftVolume, rightVolume);
    if (volumeOrder) return -volumeOrder;
  } else if (leftVolume) {
    return 1;
  } else if (rightVolume) {
    return -1;
  }

  return compareMediaTitlesByInstallment(left.title, right.title, "desc");
}
