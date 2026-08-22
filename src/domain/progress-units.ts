import { normalizeSerialEntryRecord, serializeSerialEntryRecord } from "./serial-entry-record";
import type { MediaType, NovelVolumeEntry, ProgressValue } from "../types";

export type ReadingProgressUnit = "chapter" | "season" | "volume";
export type ProgressUnit = "episode" | ReadingProgressUnit;

export const READING_PROGRESS_UNITS = ["chapter", "season", "volume"] as const;

const INTEGER_LABEL_PATTERN = /^\d+$/;
const VOLUME_LABEL_PATTERN = /^(?:\d+(?:\.5)?|\.5)$/;

function primitiveText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function isReadingProgressUnit(value: unknown): value is ReadingProgressUnit {
  return value === "chapter" || value === "season" || value === "volume";
}

export function progressUnitsFor(mediaType: MediaType): readonly ProgressUnit[] {
  return mediaType === "anime" ? ["episode"] : READING_PROGRESS_UNITS;
}

export function defaultProgressUnit(mediaType: MediaType, value: unknown): ProgressUnit {
  if (mediaType === "anime") return "episode";
  if (isReadingProgressUnit(value)) return value;
  return mediaType === "manga" ? "chapter" : "volume";
}

export function normalizeSerialLabel(value: unknown, unit: ReadingProgressUnit): string | null {
  const text = primitiveText(value).normalize("NFKC").trim().toUpperCase();
  if (unit === "volume" && text === "EX") return "EX";
  const pattern = unit === "volume" ? VOLUME_LABEL_PATTERN : INTEGER_LABEL_PATTERN;
  if (!pattern.test(text)) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) return null;
  if (unit !== "volume" && !Number.isInteger(number)) return null;
  if (unit === "volume" && !Number.isInteger(number * 2)) return null;
  return String(number);
}

export function serialSortValue(value: unknown, unit: ReadingProgressUnit): number {
  const label = normalizeSerialLabel(value, unit);
  if (label === null) return Number.POSITIVE_INFINITY;
  if (label === "EX") return Number.MAX_SAFE_INTEGER;
  return Number(label);
}

export function compareSerialLabels(
  left: unknown,
  right: unknown,
  unit: ReadingProgressUnit,
): number {
  const difference = serialSortValue(left, unit) - serialSortValue(right, unit);
  if (Number.isFinite(difference) && difference !== 0) return difference;
  return primitiveText(left).localeCompare(primitiveText(right), "en", { numeric: true });
}


export function normalizeReadingProgressValue(value: unknown): ProgressValue {
  const text = primitiveText(value).normalize("NFKC").trim();
  if (!text) return 0;
  const number = Number(text);
  return Number.isFinite(number) && String(number) === text ? number : text;
}

export function normalizeSerialProgress(
  value: unknown,
  unit: ReadingProgressUnit,
): ProgressValue | null {
  const text = primitiveText(value).normalize("NFKC").trim();
  if (!text) return 0;
  const label = normalizeSerialLabel(text, unit);
  if (label === null) return null;
  return label === "EX" ? label : Number(label);
}

export function normalizeSerialLog(
  value: unknown,
  unit: ReadingProgressUnit,
): NovelVolumeEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: NovelVolumeEntry[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const entry = normalizeSerialEntryRecord(raw, (label) => normalizeSerialLabel(label, unit));
    if (!entry || seen.has(entry.label)) continue;
    seen.add(entry.label);
    entries.push(entry);
  }
  return entries.sort((left, right) => compareSerialLabels(left.label, right.label, unit));
}

export function serializeSerialLog(
  entries: NovelVolumeEntry[],
  unit: ReadingProgressUnit,
): Array<Record<string, unknown>> {
  return normalizeSerialLog(entries, unit).map(serializeSerialEntryRecord);
}

export function highestCompletedSerialLabel(
  entries: NovelVolumeEntry[],
  unit: ReadingProgressUnit,
): string | null {
  const completed = normalizeSerialLog(entries, unit).filter((entry) => Boolean(entry.completedAt));
  return completed.length ? completed[completed.length - 1].label : null;
}
