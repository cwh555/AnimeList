import {
  ALL_CLASSIFICATIONS,
  BUILTIN_GENRES,
  BUILTIN_TAGS,
  OFFICIAL_GENRE_CATALOG,
  PROMOTED_TAG_CATALOG,
  type ClassificationCatalogEntry,
  type ClassificationKind,
} from "./classification-catalog";

export const DEFAULT_PROMOTED_TAG_RANK = 70;

export interface AniListTagInput {
  id?: number | null;
  name?: string | null;
  rank?: number | null;
  isAdult?: boolean | null;
  isGeneralSpoiler?: boolean | null;
  isMediaSpoiler?: boolean | null;
}

export interface ClassificationSelection {
  genres: string[];
  tags: string[];
}

export interface BuiltinClassification {
  kind: ClassificationKind;
  label: string;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return "";
}

function comparisonKey(value: unknown): string {
  return stringValue(value)
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, " ");
}

function lookup(entries: readonly ClassificationCatalogEntry[]): Map<string, ClassificationCatalogEntry> {
  const output = new Map<string, ClassificationCatalogEntry>();
  for (const entry of entries) {
    for (const value of [entry.id, entry.anilistName, entry.label, ...(entry.aliases ?? [])]) {
      output.set(comparisonKey(value), entry);
    }
  }
  return output;
}

const ALL_LOOKUP = lookup(ALL_CLASSIFICATIONS);
const GENRE_LOOKUP = lookup(BUILTIN_GENRES);
const TAG_LOOKUP = lookup(BUILTIN_TAGS);
const OFFICIAL_GENRE_LOOKUP = lookup(OFFICIAL_GENRE_CATALOG);
const PROMOTED_TAG_LOOKUP = lookup(PROMOTED_TAG_CATALOG);

function appendUnique(output: string[], value: string): void {
  const key = comparisonKey(value);
  if (!key || output.some((entry) => comparisonKey(entry) === key)) return;
  output.push(value);
}

function isSafeAniListTag(tag: AniListTagInput): boolean {
  return !tag.isAdult && !tag.isGeneralSpoiler && !tag.isMediaSpoiler;
}

export function builtinClassification(value: unknown): BuiltinClassification | null {
  const entry = ALL_LOOKUP.get(comparisonKey(value));
  return entry ? { kind: entry.kind, label: entry.label } : null;
}

// User-authored values are preserved here. Do not use this function for provider data.
export function normalizeClassificationValues(values: unknown, kind: ClassificationKind): string[] {
  const source = Array.isArray(values) ? values : values == null ? [] : [values];
  const catalog = kind === "genre" ? GENRE_LOOKUP : TAG_LOOKUP;
  const output: string[] = [];
  for (const raw of source) {
    const text = typeof raw === "object" && raw !== null && "name" in raw
      ? stringValue((raw as { name?: unknown }).name)
      : stringValue(raw);
    const clean = text.normalize("NFKC").trim().replace(/^#/, "");
    if (!clean) continue;
    appendUnique(output, catalog.get(comparisonKey(clean))?.label ?? clean);
  }
  return output;
}

// Provider data is strict: values outside the fixed broad-category catalog are discarded.
export function normalizeAutomaticValues(values: unknown, kind: ClassificationKind): string[] {
  const source = Array.isArray(values) ? values : values == null ? [] : [values];
  const catalog = kind === "genre" ? GENRE_LOOKUP : TAG_LOOKUP;
  const output: string[] = [];
  for (const raw of source) {
    const text = typeof raw === "object" && raw !== null && "name" in raw
      ? stringValue((raw as { name?: unknown }).name)
      : stringValue(raw);
    const entry = catalog.get(comparisonKey(text));
    if (entry) appendUnique(output, entry.label);
  }
  return output;
}

export function attachAniListGenres(
  genres: unknown,
  tags: readonly AniListTagInput[] | null | undefined = [],
  defaultMinimumRank = DEFAULT_PROMOTED_TAG_RANK,
): string[] {
  const output: string[] = [];
  for (const raw of Array.isArray(genres) ? genres : []) {
    const entry = OFFICIAL_GENRE_LOOKUP.get(comparisonKey(raw));
    if (entry) appendUnique(output, entry.label);
  }

  const rankedTags = [...(tags ?? [])]
    .filter(isSafeAniListTag)
    .sort((left, right) => Number(right.rank ?? 0) - Number(left.rank ?? 0));
  for (const tag of rankedTags) {
    const entry = PROMOTED_TAG_LOOKUP.get(comparisonKey(tag.name));
    if (!entry) continue;
    const minimumRank = entry.minimumRank ?? defaultMinimumRank;
    if (Number(tag.rank ?? 0) < minimumRank) continue;
    appendUnique(output, entry.label);
  }
  return output;
}

// Provider detail tags are intentionally not imported. Users may still create tags manually.
export function attachAniListTags(_values: readonly AniListTagInput[] | null | undefined): string[] {
  return [];
}

export function createClassificationSelection(genres: unknown, tags: unknown): ClassificationSelection {
  return {
    genres: normalizeClassificationValues(genres, "genre"),
    tags: normalizeClassificationValues(tags, "tag"),
  };
}

export function createAutomaticSelection(genres: unknown, _tags: unknown): ClassificationSelection {
  return {
    genres: normalizeAutomaticValues(genres, "genre"),
    tags: [],
  };
}

// Suggestions deliberately exclude vault-derived values so legacy pollution cannot spread.
export function classificationSuggestions(kind: ClassificationKind): string[] {
  const values = (kind === "genre" ? BUILTIN_GENRES : BUILTIN_TAGS).map((entry) => entry.label);
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "zh-Hant"));
}
