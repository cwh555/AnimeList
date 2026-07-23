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

export interface ProgressUnitOption {
  value: string;
  label: string;
}

export interface ProgressUnitValidationResult {
  valid: boolean;
  value: ProgressValue;
  reason?: "non-negative-integer";
}

export function defaultProgressUnit(mediaType: MediaType): ProgressUnit {
  if (mediaType === "anime") return "episode";
  return mediaType === "novel" ? "volume" : "chapter";
}

export function progressUnitLabel(unit: unknown): string {
  const normalized = String(unit ?? "").trim().toLowerCase() as ProgressUnit;
  return PROGRESS_UNIT_LABELS[normalized] ?? String(unit ?? "").trim();
}

export function progressUnitOptions(
  mediaType: MediaType,
  currentUnit?: unknown,
): ProgressUnitOption[] {
  const supported = mediaType === "anime" ? ANIME_PROGRESS_UNITS : READING_PROGRESS_UNITS;
  const options: ProgressUnitOption[] = supported.map((value) => ({
    value,
    label: PROGRESS_UNIT_LABELS[value],
  }));
  const current = String(currentUnit ?? "").trim();
  if (current && !options.some((option) => option.value === current)) {
    options.push({ value: current, label: current });
  }
  return options;
}

export function normalizeProgressUnit(value: unknown, mediaType: MediaType): string {
  const normalized = String(value ?? "").trim();
  return normalized || defaultProgressUnit(mediaType);
}

export function validateProgressForUnit(
  value: unknown,
  unit: unknown,
): ProgressUnitValidationResult {
  const normalizedUnit = String(unit ?? "").trim().toLowerCase();
  if (normalizedUnit === "volume") {
    return { valid: true, value: typeof value === "number" ? value : String(value ?? "").trim() };
  }
  const text = String(value ?? "").normalize("NFKC").trim();
  const numericValue = text === "" ? 0 : Number(text);
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    return { valid: false, value: 0, reason: "non-negative-integer" };
  }
  return { valid: true, value: numericValue };
}
