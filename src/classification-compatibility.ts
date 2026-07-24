import {
  builtinClassification,
  createClassificationSelection,
  normalizeClassificationValues,
  type ClassificationSelection,
} from "./media-classification";
import type { ExternalMediaResult } from "./types";

export const CLASSIFICATION_VERSION = 1;

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

function values(value: unknown): string[] {
  const source = Array.isArray(value) ? value : value == null ? [] : [value];
  return source.map(stringValue).map((entry) => entry.normalize("NFKC").trim().replace(/^#/, "")).filter(Boolean);
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
  "bangumi", "openlibrary", "true", "false",
]);

function metadataKeys(frontmatter: Record<string, unknown>, fileBasename = ""): Set<string> {
  const keys = new Set<string>();
  const add = (value: unknown): void => {
    for (const entry of values(value)) {
      const key = comparisonKey(entry);
      if (key) keys.add(key);
    }
  };
  add(fileBasename);
  for (const key of [
    "title", "title_original", "title_romaji", "year", "media_type", "format", "status",
    "release_status", "progress", "progress_total", "progress_unit", "score", "started_at",
    "completed_at", "cover", "cover_remote", "source_provider", "source_id", "source_urls",
    "studios", "authors", "creators", "platforms",
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

function classificationVersion(frontmatter: Record<string, unknown>): number {
  const value = Number(frontmatter.classification_version ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function isLegacyNonAniList(frontmatter: Record<string, unknown>): boolean {
  const provider = comparisonKey(frontmatter.source_provider);
  return classificationVersion(frontmatter) < CLASSIFICATION_VERSION
    && Boolean(provider)
    && provider !== "anilist";
}

export function isLegacyGenreFieldLabel(value: unknown): boolean {
  const label = stringValue(value).normalize("NFKC").trim();
  return label === "分類" || /^genres?$/i.test(label);
}

export function automaticClassificationForResult(result: ExternalMediaResult): ClassificationSelection {
  if (result.provider.toLocaleLowerCase() !== "anilist") return { genres: [], tags: [] };
  return createClassificationSelection(result.genres, result.tags);
}

export function sanitizeStoredClassification(
  frontmatter: Record<string, unknown>,
  fileBasename = "",
): ClassificationCleanupResult {
  const output: ClassificationCleanupResult = { genres: [], tags: [], removed: [], moved: [] };
  const metadata = metadataKeys(frontmatter, fileBasename);
  const suppressLegacyGenres = isLegacyNonAniList(frontmatter);

  const process = (rawValues: unknown, originalKind: "genre" | "tag", allowCustom: boolean): void => {
    for (const raw of values(rawValues)) {
      if (originalKind === "genre" && suppressLegacyGenres) {
        appendUnique(output.removed, raw);
        continue;
      }
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

  // Obsidian already uses the generic `tags` key. Legacy notes may contain years,
  // titles, project tags, or other note metadata there, so only recognized catalog
  // values are copied into media classification and the original field is untouched.
  if (classificationVersion(frontmatter) < CLASSIFICATION_VERSION && frontmatter.media_tags == null) {
    process(frontmatter.tags, "tag", false);
  }
  return output;
}

export function applySanitizedClassification(
  frontmatter: Record<string, unknown>,
  selection: ClassificationSelection,
  fileBasename = "",
): ClassificationCleanupResult {
  if (isLegacyNonAniList(frontmatter)) {
    const legacyGenres = values(frontmatter.genres);
    if (legacyGenres.length && frontmatter.classification_legacy_genres == null) {
      frontmatter.classification_legacy_genres = legacyGenres;
    }
  }
  const result = sanitizeStoredClassification({
    ...frontmatter,
    classification_version: CLASSIFICATION_VERSION,
    genres: selection.genres,
    media_tags: selection.tags,
  }, fileBasename);
  frontmatter.classification_version = CLASSIFICATION_VERSION;
  frontmatter.genres = [...result.genres];
  if (result.tags.length) frontmatter.media_tags = [...result.tags];
  else delete frontmatter.media_tags;
  return result;
}
