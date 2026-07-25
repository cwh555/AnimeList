import type { MediaType, NovelVolumeEntry, ProgressValue } from "./types";

export type ReadingProgressUnit = "chapter" | "season" | "volume";
export type ProgressUnit = "episode" | ReadingProgressUnit;

export const READING_PROGRESS_UNITS = ["chapter", "season", "volume"] as const;

const INTEGER_LABEL_PATTERN = /^\d+$/;
const VOLUME_LABEL_PATTERN = /^(?:\d+(?:\.5)?|\.5)$/;

function primitiveText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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
    const record = recordValue(raw);
    if (!record) continue;
    const label = normalizeSerialLabel(record.label ?? record.volume, unit);
    if (!label || seen.has(label)) continue;
    seen.add(label);

    const known = new Set([
      "label", "volume", "started_at", "startedAt", "completed_at", "completedAt",
      "cover", "cover_provider", "coverProvider", "cover_source_id", "coverSourceId",
      "cover_manual", "coverManual",
    ]);
    const extra = Object.fromEntries(Object.entries(record).filter(([key]) => !known.has(key)));
    const entry: NovelVolumeEntry = {
      label,
      startedAt: primitiveText(record.started_at ?? record.startedAt),
      completedAt: primitiveText(record.completed_at ?? record.completedAt),
    };
    const cover = primitiveText(record.cover);
    const coverProvider = primitiveText(record.cover_provider ?? record.coverProvider);
    const coverSourceId = primitiveText(record.cover_source_id ?? record.coverSourceId);
    if (cover) entry.cover = cover;
    if (coverProvider) entry.coverProvider = coverProvider;
    if (coverSourceId) entry.coverSourceId = coverSourceId;
    if (record.cover_manual === true || record.coverManual === true) entry.coverManual = true;
    if (Object.keys(extra).length) entry.extra = extra;
    entries.push(entry);
  }
  return entries.sort((left, right) => compareSerialLabels(left.label, right.label, unit));
}

export function serializeSerialLog(
  entries: NovelVolumeEntry[],
  unit: ReadingProgressUnit,
): Array<Record<string, unknown>> {
  return normalizeSerialLog(entries, unit).map((entry) => {
    const serialized: Record<string, unknown> = { ...(entry.extra ?? {}), label: entry.label };
    if (entry.startedAt) serialized.started_at = entry.startedAt;
    if (entry.completedAt) serialized.completed_at = entry.completedAt;
    if (entry.cover) serialized.cover = entry.cover;
    if (entry.coverProvider) serialized.cover_provider = entry.coverProvider;
    if (entry.coverSourceId) serialized.cover_source_id = entry.coverSourceId;
    if (entry.coverManual) serialized.cover_manual = true;
    return serialized;
  });
}

export function highestCompletedSerialLabel(
  entries: NovelVolumeEntry[],
  unit: ReadingProgressUnit,
): string | null {
  const completed = normalizeSerialLog(entries, unit).filter((entry) => Boolean(entry.completedAt));
  return completed.length ? completed[completed.length - 1].label : null;
}
