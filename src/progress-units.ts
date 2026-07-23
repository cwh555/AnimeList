import type { MediaType, ProgressValue } from "./types";

export const READING_PROGRESS_UNITS = ["chapter", "season", "volume"] as const;
export const ANIME_PROGRESS_UNITS = ["episode"] as const;

export type ReadingProgressUnit = (typeof READING_PROGRESS_UNITS)[number];
export type AnimeProgressUnit = (typeof ANIME_PROGRESS_UNITS)[number];
export type ProgressUnit = AnimeProgressUnit | ReadingProgressUnit;

const PROGRESS_UNIT_LABELS: Readonly<Record<ProgressUnit, string>> = {
  episode: "集",
  chapter: "話",
  season: "季",
  volume: "卷",
};

export const PROGRESS_UNIT_UI_TEXT = {
  fieldLabel: "進度單位",
  integerProgressError: "以話或季記錄時，進度必須是 0 或正整數。",
  readingProgressLabelPrefix: "目前閱讀",
} as const;

export interface ProgressUnitOption {
  value: string;
  label: string;
}

export interface ProgressUnitValidationResult {
  valid: boolean;
  value: ProgressValue;
  reason?: "non-negative-integer";
}

function scalarString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function defaultProgressUnit(mediaType: MediaType): ProgressUnit {
  if (mediaType === "anime") return "episode";
  return mediaType === "novel" ? "volume" : "chapter";
}

export function progressUnitLabel(unit: unknown): string {
  const raw = scalarString(unit).trim();
  const normalized = raw.toLowerCase() as ProgressUnit;
  return PROGRESS_UNIT_LABELS[normalized] ?? raw;
}

export function progressUnitOptions(
  mediaType: MediaType,
  currentUnit?: unknown,
): ProgressUnitOption[] {
  const supported: readonly ProgressUnit[] = mediaType === "anime"
    ? ANIME_PROGRESS_UNITS
    : READING_PROGRESS_UNITS;
  const options: ProgressUnitOption[] = supported.map((value) => ({
    value,
    label: PROGRESS_UNIT_LABELS[value],
  }));
  const current = scalarString(currentUnit).trim();
  if (current && !options.some((option) => option.value === current)) {
    options.push({ value: current, label: current });
  }
  return options;
}

export function normalizeProgressUnit(value: unknown, mediaType: MediaType): string {
  const normalized = scalarString(value).trim();
  return normalized || defaultProgressUnit(mediaType);
}

export function validateProgressForUnit(
  value: unknown,
  unit: unknown,
): ProgressUnitValidationResult {
  const normalizedUnit = scalarString(unit).trim().toLowerCase();
  if (normalizedUnit === "volume") {
    return { valid: true, value: typeof value === "number" ? value : scalarString(value).trim() };
  }
  const text = scalarString(value).normalize("NFKC").trim();
  const numericValue = text === "" ? 0 : Number(text);
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    return { valid: false, value: 0, reason: "non-negative-integer" };
  }
  return { valid: true, value: numericValue };
}
