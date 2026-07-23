import { compareVolumeLabels, normalizeVolumeLog } from "./novel-progress";
import {
  parseProgressForUnit,
  READING_PROGRESS_UNITS,
  synchronizeProgressWithVolumeLog,
} from "./progress-units";
import type {
  MediaItem,
  MediaType,
  NovelVolumeEntry,
  ProgressValue,
  ReadingProgressEntry,
  TimelineMediaEntry,
} from "./types";

export type ReadingProgressUnit = typeof READING_PROGRESS_UNITS[number];

function scalarText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).normalize("NFKC").trim()
    : "";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeReadingProgressUnit(value: unknown): ReadingProgressUnit | null {
  const unit = scalarText(value).toLowerCase();
  return READING_PROGRESS_UNITS.includes(unit as ReadingProgressUnit)
    ? unit as ReadingProgressUnit
    : null;
}

export function compareReadingProgressValues(
  left: ProgressValue,
  right: ProgressValue,
  unit: ReadingProgressUnit,
): number {
  if (unit === "volume") return compareVolumeLabels(left, right);
  return Number(left) - Number(right);
}

export function compareReadingProgressEntries(
  left: ReadingProgressEntry,
  right: ReadingProgressEntry,
): number {
  const leftUnit = normalizeReadingProgressUnit(left.unit);
  const rightUnit = normalizeReadingProgressUnit(right.unit);
  if (!leftUnit || !rightUnit) return scalarText(left.unit).localeCompare(scalarText(right.unit));
  const unitOrder = READING_PROGRESS_UNITS.indexOf(leftUnit) - READING_PROGRESS_UNITS.indexOf(rightUnit);
  if (unitOrder) return unitOrder;
  return compareReadingProgressValues(left.value, right.value, leftUnit);
}

export function normalizeReadingProgressEntry(value: unknown): ReadingProgressEntry | null {
  const record = recordValue(value);
  if (!record) return null;
  const unit = normalizeReadingProgressUnit(record.unit ?? record.progress_unit);
  if (!unit) return null;
  const rawValue = record.value ?? record.progress ?? record.label;
  if (!scalarText(rawValue)) return null;
  const parsed = parseProgressForUnit(rawValue, unit);
  if (!parsed.ok) return null;
  return {
    value: parsed.value,
    unit,
    startedAt: scalarText(record.started_at ?? record.startedAt),
    completedAt: scalarText(record.completed_at ?? record.completedAt),
  };
}

export function readingProgressEntryKey(entry: ReadingProgressEntry): string {
  return `${entry.unit}:${String(entry.value).toUpperCase()}`;
}

export function normalizeReadingProgressLog(value: unknown): ReadingProgressEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: ReadingProgressEntry[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const entry = normalizeReadingProgressEntry(raw);
    if (!entry) continue;
    const key = readingProgressEntryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries.sort(compareReadingProgressEntries);
}

export function serializeReadingProgressLog(
  entries: ReadingProgressEntry[],
): Array<Record<string, ProgressValue | string>> {
  return normalizeReadingProgressLog(entries).map((entry) => {
    const serialized: Record<string, ProgressValue | string> = {
      value: entry.value,
      unit: entry.unit,
    };
    if (entry.startedAt) serialized.started_at = entry.startedAt;
    if (entry.completedAt) serialized.completed_at = entry.completedAt;
    return serialized;
  });
}

export function nextReadingProgressValue(
  entries: ReadingProgressEntry[],
  unit: ReadingProgressUnit,
): ProgressValue {
  const values = normalizeReadingProgressLog(entries)
    .filter((entry) => entry.unit === unit && entry.value !== "EX")
    .map((entry) => Number(entry.value))
    .filter((value) => Number.isFinite(value));
  return values.length ? Math.floor(Math.max(...values)) + 1 : 1;
}

export function synchronizeProgressWithReadingLog(
  progress: ProgressValue,
  unit: unknown,
  entries: ReadingProgressEntry[],
): ProgressValue {
  const normalizedUnit = normalizeReadingProgressUnit(unit);
  if (!normalizedUnit) return progress;
  const completed = normalizeReadingProgressLog(entries)
    .filter((entry) => entry.unit === normalizedUnit && Boolean(entry.completedAt));
  if (!completed.length) return progress;
  const highest = completed[completed.length - 1];
  return compareReadingProgressValues(progress, highest.value, normalizedUnit) >= 0
    ? progress
    : highest.value;
}

export function synchronizeMediaReadingProgress(
  mediaType: MediaType,
  progress: ProgressValue,
  unit: unknown,
  readingLog: ReadingProgressEntry[],
  volumeLog: NovelVolumeEntry[],
): ProgressValue {
  if (mediaType === "manga") return synchronizeProgressWithReadingLog(progress, unit, readingLog);
  if (mediaType === "novel") return synchronizeProgressWithVolumeLog(progress, unit, volumeLog);
  return progress;
}

export function readingEntriesFromVolumeLog(value: unknown): ReadingProgressEntry[] {
  return normalizeVolumeLog(value).map((entry) => ({
    value: entry.label === "EX" ? "EX" : Number(entry.label),
    unit: "volume",
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
  }));
}

export function volumeEntriesFromReadingProgress(
  entries: ReadingProgressEntry[],
): NovelVolumeEntry[] {
  return normalizeVolumeLog(normalizeReadingProgressLog(entries)
    .filter((entry) => entry.unit === "volume")
    .map((entry) => ({
      label: entry.value,
      started_at: entry.startedAt,
      completed_at: entry.completedAt,
    })));
}

export function expandMangaReadingTimelineEntries(item: MediaItem): TimelineMediaEntry[] {
  if (item.mediaType !== "manga") return [];
  return normalizeReadingProgressLog(item.readingLog)
    .filter((entry) => Boolean(entry.completedAt))
    .map((entry) => ({
      ...item,
      seriesTitle: item.title,
      completedAt: entry.completedAt,
      progressValue: entry.value,
      progressUnit: entry.unit,
    }));
}
