import {
  builtinClassification,
  createAutomaticSelection,
  createClassificationSelection,
  normalizeClassificationValues,
  type ClassificationSelection,
} from "./media-classification";
import type { ExternalMediaResult } from "./types";

export const CLASSIFICATION_VERSION = 3;

export interface ClassificationCleanupResult extends ClassificationSelection {
  removed: string[];
  moved: string[];
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (typeof value === "object" && value !== null && "name" in value) {
    return stringValue((value as { name?: unknown }).name);
  }
  return "";
}

export function classificationValues(value: unknown): string[] {
  const source = Array.isArray(value) ? value : value == null ? [] : [value];
  return source
    .map(stringValue)
    .map((entry) => entry.normalize("NFKC").trim().replace(/^#/, ""))
    .filter(Boolean);
}

function comparisonKey(value: unknown): string {
  return stringValue(value)
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, " ");
}

const STRUCTURAL_VALUES = new Set([
  "anime", "manga", "novel", "tv", "movie", "ova", "ona", "special",
  "one shot", "light novel", "planned", "planning", "watching", "reading", "ongoing",
  "completed", "paused", "on hold", "dropped", "releasing", "finished", "hiatus",
  "cancelled", "unknown", "episode", "chapter", "season", "volume", "anilist",
  "bangumi", "openlibrary", "true", "false", "manga adaptation", "adapted from manga",
  "漫畫改", "漫改", "漫画改",
]);

function metadataKeys(frontmatter: Record<string, unknown>, fileBasename = ""): Set<string> {
  const keys = new Set<string>();
  const add = (value: unknown): void => {
    for (const entry of classificationValues(value)) {
      const key = comparisonKey(entry);
      if (key) keys.add(key);
    }
  };
  add(fileBasename);
  for (const key of [
    "title", "title_original", "title_romaji", "year", "media_type", "format", "status",
    "release_status", "progress", "progress_total", "progress_unit", "score", "started_at",
    "completed_at", "cover", "cover_remote", "source_provider", "source_id", "source_urls",
    "studios", "authors", "creators", "platforms", "people",
  ]) add(frontmatter[key]);
  return keys;
}

function isClearlyMetadata(value: string, keys: ReadonlySet<string>): boolean {
  const key = comparisonKey(value);
  if (!key || keys.has(key) || STRUCTURAL_VALUES.has(key)) return true;
  if (/^https?:\/\//i.test(value)) return true;
  if (/^\d+(?:\.\d+)?$/.test(value)) return true;
  if (/^(?:18|19|20|21)\d{2}(?:[-/.]\d{1,2}(?:[-/.]\d{1,2})?)?$/.test(value)) return true;
  if (/^\[object\s+object\]$/i.test(value)) return true;
  return false;
}

function appendUnique(output: string[], value: string): void {
  const key = comparisonKey(value);
  if (!key || output.some((entry) => comparisonKey(entry) === key)) return;
  output.push(value);
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function isLegacyGenreFieldLabel(value: unknown): boolean {
  const label = stringValue(value).normalize("NFKC").trim();
  return label === "分類" || /^genres?$/i.test(label);
}

export function automaticClassificationForResult(result: ExternalMediaResult): ClassificationSelection {
  if (result.provider.toLocaleLowerCase() !== "anilist") return { genres: [], tags: [] };
  return createAutomaticSelection(result.genres, result.tags);
}

export function storedClassificationSelection(frontmatter: Record<string, unknown>): ClassificationSelection {
  return createClassificationSelection(frontmatter.genres, frontmatter.media_tags);
}

export function writeClassificationSelection(frontmatter: Record<string, unknown>, selection: ClassificationSelection): ClassificationSelection {
  const normalized = createClassificationSelection(selection.genres, selection.tags);
  frontmatter.genres = [...normalized.genres];
  if (normalized.tags.length) frontmatter.media_tags = [...normalized.tags];
  else delete frontmatter.media_tags;
  return normalized;
}

export function sanitizeStoredClassification(frontmatter: Record<string, unknown>, fileBasename = ""): ClassificationCleanupResult {
  const output: ClassificationCleanupResult = { genres: [], tags: [], removed: [], moved: [] };
  const metadata = metadataKeys(frontmatter, fileBasename);
  const process = (rawValues: unknown, originalKind: "genre" | "tag", allowCustom: boolean): void => {
    for (const raw of classificationValues(rawValues)) {
      const builtin = builtinClassification(raw);
      if (builtin) {
        appendUnique(builtin.kind === "genre" ? output.genres : output.tags, builtin.label);
        if (builtin.kind !== originalKind) appendUnique(output.moved, raw);
        continue;
      }
      if (!allowCustom || isClearlyMetadata(raw, metadata)) {
        appendUnique(output.removed, raw);
        continue;
      }
      const normalized = normalizeClassificationValues([raw], originalKind)[0];
      if (normalized) appendUnique(originalKind === "genre" ? output.genres : output.tags, normalized);
    }
  };
  process(frontmatter.genres, "genre", true);
  process(frontmatter.media_tags, "tag", true);
  if (frontmatter.media_tags == null) process(frontmatter.tags, "tag", false);
  return output;
}

export function migrateClassificationFrontmatter(frontmatter: Record<string, unknown>, fileBasename = ""): ClassificationCleanupResult {
  const beforeGenres = classificationValues(frontmatter.genres);
  const beforeTags = classificationValues(frontmatter.media_tags);
  const result = sanitizeStoredClassification(frontmatter, fileBasename);
  if (!arraysEqual(beforeGenres, result.genres) && frontmatter.classification_legacy_genres == null) frontmatter.classification_legacy_genres = [...beforeGenres];
  if (!arraysEqual(beforeTags, result.tags) && beforeTags.length && frontmatter.classification_legacy_media_tags == null) frontmatter.classification_legacy_media_tags = [...beforeTags];
  writeClassificationSelection(frontmatter, result);
  frontmatter.classification_version = CLASSIFICATION_VERSION;
  return result;
}
