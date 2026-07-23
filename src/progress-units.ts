import { compareVolumeLabels, highestCompletedVolume, normalizeProgressValue, normalizeVolumeLabel } from "./novel-progress";
import type { MediaType, NovelVolumeEntry, ProgressValue } from "./types";

export const KNOWN_PROGRESS_UNITS = ["episode", "chapter", "season", "volume"] as const;
export type KnownProgressUnit = typeof KNOWN_PROGRESS_UNITS[number];
export type ProgressValidationFailure = "integer" | "volume";
export type ProgressValidationResult =
  | { ok: true; value: ProgressValue }
  | { ok: false; reason: ProgressValidationFailure };

export const READING_PROGRESS_UNITS = ["chapter", "season", "volume"] as const;

function scalarText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value).normalize("NFKC").trim()
    : "";
}

export function defaultProgressUnit(mediaType: MediaType): KnownProgressUnit {
  if (mediaType === "anime") return "episode";
  return mediaType === "manga" ? "chapter" : "volume";
}

export function normalizeProgressUnit(value: unknown, mediaType: MediaType): string {
  return scalarText(value).toLowerCase() || defaultProgressUnit(mediaType);
}

export function progressUnitsForMediaType(mediaType: MediaType, currentUnit?: unknown): string[] {
  const supported = mediaType === "anime" ? ["episode"] : [...READING_PROGRESS_UNITS];
  const current = normalizeProgressUnit(currentUnit, mediaType);
  return supported.includes(current as KnownProgressUnit) ? supported : [...supported, current];
}

export function progressUnitUsesFlexibleValue(unit: unknown): boolean {
  const normalized = scalarText(unit).toLowerCase();
  return normalized === "volume" || !KNOWN_PROGRESS_UNITS.includes(normalized as KnownProgressUnit);
}

export function synchronizeProgressWithVolumeLog(
  progress: ProgressValue,
  unit: unknown,
  volumeLog: NovelVolumeEntry[],
): ProgressValue {
  if (scalarText(unit).toLowerCase() !== "volume") return progress;
  const completedVolume = highestCompletedVolume(volumeLog);
  if (!completedVolume || compareVolumeLabels(progress, completedVolume) >= 0) return progress;
  return completedVolume === "EX" ? "EX" : Number(completedVolume);
}

export function parseProgressForUnit(value: unknown, unit: unknown): ProgressValidationResult {
  const normalizedUnit = scalarText(unit).toLowerCase();
  if (normalizedUnit === "volume") {
    const text = scalarText(value);
    if (!text || text === "0") return { ok: true, value: 0 };
    const normalized = normalizeVolumeLabel(text);
    return normalized === null
      ? { ok: false, reason: "volume" }
      : { ok: true, value: normalized === "EX" ? "EX" : Number(normalized) };
  }
  if (normalizedUnit === "episode" || normalizedUnit === "chapter" || normalizedUnit === "season") {
    const text = scalarText(value);
    if (!text) return { ok: true, value: 0 };
    const number = Number(text);
    return Number.isInteger(number) && number >= 0
      ? { ok: true, value: number }
      : { ok: false, reason: "integer" };
  }
  return { ok: true, value: normalizeProgressValue(value) };
}
