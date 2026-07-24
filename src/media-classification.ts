import {
  BUILTIN_GENRES,
  BUILTIN_TAGS,
  type ClassificationCatalogEntry,
  type ClassificationKind,
} from "./classification-catalog";

export const DEFAULT_TAG_RANK = 60;
export const DEFAULT_TAG_LIMIT = 8;

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

function catalogFor(kind: ClassificationKind): readonly ClassificationCatalogEntry[] {
  return kind === "genre" ? BUILTIN_GENRES : BUILTIN_TAGS;
}

function catalogLookup(kind: ClassificationKind): Map<string, ClassificationCatalogEntry> {
  const lookup = new Map<string, ClassificationCatalogEntry>();
  for (const entry of catalogFor(kind)) {
    for (const value of [entry.id, entry.anilistName, entry.label, ...(entry.aliases ?? [])]) {
      lookup.set(comparisonKey(value), entry);
    }
  }
  return lookup;
}

const GENRE_LOOKUP = catalogLookup("genre");
const TAG_LOOKUP = catalogLookup("tag");

export function builtinClassification(value: unknown): BuiltinClassification | null {
  const key = comparisonKey(value);
  const genre = GENRE_LOOKUP.get(key);
  if (genre) return { kind: "genre", label: genre.label };
  const tag = TAG_LOOKUP.get(key);
  return tag ? { kind: "tag", label: tag.label } : null;
}

export function normalizeClassificationValues(values: unknown, kind: ClassificationKind): string[] {
  const source = Array.isArray(values) ? values : values == null ? [] : [values];
  const lookup = kind === "genre" ? GENRE_LOOKUP : TAG_LOOKUP;
  const output: string[] = [];
  const seen = new Set<string>();
  for (const raw of source) {
    const text = typeof raw === "object" && raw !== null && "name" in raw
      ? stringValue((raw as { name?: unknown }).name)
      : stringValue(raw);
    const clean = text.normalize("NFKC").trim().replace(/^#/, "");
    if (!clean) continue;
    const builtin = lookup.get(comparisonKey(clean));
    const value = builtin?.label ?? clean;
    const key = comparisonKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

export function attachAniListGenres(values: unknown): string[] {
  const source = Array.isArray(values) ? values : [];
  const output: string[] = [];
  const seen = new Set<string>();
  for (const raw of source) {
    const entry = GENRE_LOOKUP.get(comparisonKey(raw));
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    output.push(entry.label);
  }
  return output;
}

export function attachAniListTags(
  values: readonly AniListTagInput[] | null | undefined,
  rankThreshold = DEFAULT_TAG_RANK,
  limit = DEFAULT_TAG_LIMIT,
): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  const candidates = [...(values ?? [])]
    .filter((tag) => (
      !tag.isAdult
      && !tag.isGeneralSpoiler
      && !tag.isMediaSpoiler
      && Number(tag.rank ?? 0) >= rankThreshold
    ))
    .sort((left, right) => Number(right.rank ?? 0) - Number(left.rank ?? 0));
  for (const tag of candidates) {
    const entry = TAG_LOOKUP.get(comparisonKey(tag.name));
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    output.push(entry.label);
    if (output.length >= limit) break;
  }
  return output;
}

export function createClassificationSelection(genres: unknown, tags: unknown): ClassificationSelection {
  return {
    genres: normalizeClassificationValues(genres, "genre"),
    tags: normalizeClassificationValues(tags, "tag"),
  };
}

export function classificationSuggestions(kind: ClassificationKind, customValues: unknown = []): string[] {
  return normalizeClassificationValues([
    ...catalogFor(kind).map((entry) => entry.label),
    ...normalizeClassificationValues(customValues, kind),
  ], kind).sort((left, right) => left.localeCompare(right, "zh-Hant"));
}
