import type { MediaSeason } from "../domain/media-classification";
import { normalizeAnimeStudios, normalizeBroadGenres, normalizeGenres } from "../domain/media-metadata";
import { normalizeEditableStudios } from "../domain/media-editable-classification";
import { asArray, stringValue } from "../domain/value-normalization";

const LEGACY_SELECTED_TAG_KEYS = [
  "classification_genres",
  "classification_tags",
  "classification_selected_genres",
  "classification_selected_tags",
] as const;

const LEGACY_SOURCE_TAG_KEYS = [
  "classification_source_genres",
  "classification_source_tags",
  "classification_raw_genres",
  "classification_raw_tags",
  "classification_tags_raw",
] as const;

const LEGACY_STUDIO_KEYS = [
  "classification_studios",
  "classification_studio",
  "classification_companies",
  "classification_company",
  "classification_people",
] as const;

const LEGACY_SEASON_KEYS = ["classification_season", "classification_quarter"] as const;
const LEGACY_SEASON_YEAR_KEYS = ["classification_season_year", "classification_year"] as const;
const LEGACY_STRUCTURAL_SUFFIX = /(?:version|count|threshold|rank|min|max)$/i;
const FORMAT_OR_NOISE = /^(?:tv|ova|ona|web|movie|special|music|manga|novel|one[_ -]?shot)$/i;
const DATE_TOKEN = /(?:^|\D)((?:19|20)\d{2})\s*(?:年|[-/.])\s*(1[0-2]|0?[1-9])\s*(?:月)?(?:\D|$)/;
const COMPANY_HINT = /(?:studio|pictures?|animation|works|films?|動画工房|動畫工房|动画工房|アニメーション|スタジオ)/i;
const ALL_CAPS_COMPANY = /^[A-Z][A-Z0-9&.]{2,}(?:[- ][A-Z0-9&.]+)*$/;

function strings(value: unknown): string[] {
  return asArray(value)
    .map((entry) => stringValue(entry).normalize("NFKC").trim())
    .filter(Boolean);
}

function valuesFor(frontmatter: Record<string, unknown>, keys: readonly string[]): string[] {
  return keys.flatMap((key) => strings(frontmatter[key]));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function legacyClassificationKeys(frontmatter: Record<string, unknown>): string[] {
  return Object.keys(frontmatter).filter((key) => key.startsWith("classification_"));
}

function unclaimedLegacyValues(frontmatter: Record<string, unknown>): string[] {
  const claimed = new Set<string>([
    ...LEGACY_SELECTED_TAG_KEYS,
    ...LEGACY_SOURCE_TAG_KEYS,
    ...LEGACY_STUDIO_KEYS,
    ...LEGACY_SEASON_KEYS,
    ...LEGACY_SEASON_YEAR_KEYS,
    "classification_anilist_id",
    "classification_source_material",
    "classification_source",
  ]);
  const output: string[] = [];
  for (const key of legacyClassificationKeys(frontmatter)) {
    if (claimed.has(key) || LEGACY_STRUCTURAL_SUFFIX.test(key)) continue;
    output.push(...strings(frontmatter[key]));
  }
  return output;
}

export function compatibleSourceGenres(frontmatter: Record<string, unknown>): string[] {
  return unique([
    ...strings(frontmatter.source_genres),
    ...valuesFor(frontmatter, LEGACY_SOURCE_TAG_KEYS),
    ...unclaimedLegacyValues(frontmatter),
  ]);
}

export function legacySelectedClassificationTags(frontmatter: Record<string, unknown>): string[] {
  return normalizeGenres(valuesFor(frontmatter, LEGACY_SELECTED_TAG_KEYS), 32);
}

export function compatibleGenres(frontmatter: Record<string, unknown>): string[] {
  return normalizeGenres([
    ...strings(frontmatter.genres),
    ...strings(frontmatter.user_tags),
    ...legacySelectedClassificationTags(frontmatter),
  ], 32);
}

export function writeCompatibleGenres(
  frontmatter: Record<string, unknown>,
  values: unknown,
): string[] {
  const genres = normalizeGenres(values, 32);
  if (genres.length) frontmatter.genres = genres;
  else delete frontmatter.genres;
  delete frontmatter.user_tags;
  for (const key of LEGACY_SELECTED_TAG_KEYS) delete frontmatter[key];
  return genres;
}

function seasonFromValue(value: unknown): MediaSeason | null {
  const normalized = stringValue(value).normalize("NFKC").trim().toLocaleLowerCase();
  if (!normalized) return null;
  if (normalized === "winter" || normalized === "q1" || /冬/.test(normalized)) return "winter";
  if (normalized === "spring" || normalized === "q2" || /春/.test(normalized)) return "spring";
  if (normalized === "summer" || normalized === "q3" || /夏/.test(normalized)) return "summer";
  if (normalized === "fall" || normalized === "autumn" || normalized === "q4" || /秋/.test(normalized)) return "fall";
  return null;
}

function seasonFromMonth(month: number): MediaSeason | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (month <= 3) return "winter";
  if (month <= 6) return "spring";
  if (month <= 9) return "summer";
  return "fall";
}

export interface CompatibleSeasonMetadata {
  season: MediaSeason | null;
  seasonYear: number | null;
}

export function seasonMetadataFromValues(values: readonly string[], fallbackYear: unknown = null): CompatibleSeasonMetadata {
  let season: MediaSeason | null = null;
  let seasonYear: number | null = null;
  for (const value of values) {
    season ??= seasonFromValue(value);
    const match = value.normalize("NFKC").match(DATE_TOKEN);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (Number.isInteger(year)) seasonYear ??= year;
    season ??= seasonFromMonth(month);
    if (season && seasonYear !== null) break;
  }
  const fallback = Number(fallbackYear);
  if (seasonYear === null && Number.isInteger(fallback) && fallback > 0) seasonYear = fallback;
  return { season, seasonYear };
}

export function compatibleSeasonMetadata(frontmatter: Record<string, unknown>): CompatibleSeasonMetadata {
  const canonicalSeason = seasonFromValue(frontmatter.season);
  const canonicalYear = Number(frontmatter.season_year);
  if (canonicalSeason && Number.isInteger(canonicalYear)) {
    return { season: canonicalSeason, seasonYear: canonicalYear };
  }

  const legacySeason = valuesFor(frontmatter, LEGACY_SEASON_KEYS).map(seasonFromValue).find(Boolean) ?? null;
  const legacyYear = valuesFor(frontmatter, LEGACY_SEASON_YEAR_KEYS)
    .map(Number)
    .find((value) => Number.isInteger(value) && value > 0) ?? null;
  const inferred = seasonMetadataFromValues(compatibleSourceGenres(frontmatter), frontmatter.year);
  return {
    season: canonicalSeason ?? legacySeason ?? inferred.season,
    seasonYear: Number.isInteger(canonicalYear) ? canonicalYear : legacyYear ?? inferred.seasonYear,
  };
}

function likelyLegacyStudio(value: string): boolean {
  const clean = value.normalize("NFKC").trim();
  if (!clean || FORMAT_OR_NOISE.test(clean) || /^\d{4}/.test(clean)) return false;
  if (normalizeBroadGenres([clean]).length) return false;
  return COMPANY_HINT.test(clean) || ALL_CAPS_COMPANY.test(clean);
}

export function compatibleStudios(frontmatter: Record<string, unknown>): string[] {
  const canonical = normalizeAnimeStudios(frontmatter.studios);
  if (canonical.length) return canonical;
  const explicit = normalizeAnimeStudios(valuesFor(frontmatter, LEGACY_STUDIO_KEYS));
  if (explicit.length) return explicit;
  return normalizeAnimeStudios(compatibleSourceGenres(frontmatter).filter(likelyLegacyStudio));
}

export function writeCompatibleStudios(
  frontmatter: Record<string, unknown>,
  values: unknown,
): string[] {
  const studios = normalizeEditableStudios(values);
  if (studios.length) frontmatter.studios = studios;
  else delete frontmatter.studios;
  for (const key of LEGACY_STUDIO_KEYS) delete frontmatter[key];
  return studios;
}

export interface LegacyClassificationMigration {
  changed: boolean;
  removedKeys: string[];
  canonicalKeys: string[];
}

export function migrateLegacyClassificationHeaders(frontmatter: Record<string, unknown>): LegacyClassificationMigration {
  const removedKeys = legacyClassificationKeys(frontmatter);
  if (!removedKeys.length) return { changed: false, removedKeys: [], canonicalKeys: [] };

  const canonicalKeys: string[] = [];
  const genres = compatibleGenres(frontmatter);
  const sourceGenres = compatibleSourceGenres(frontmatter);
  const studios = compatibleStudios(frontmatter);
  const season = compatibleSeasonMetadata(frontmatter);

  if (genres.length && JSON.stringify(strings(frontmatter.genres)) !== JSON.stringify(genres)) {
    frontmatter.genres = genres;
    canonicalKeys.push("genres");
  }
  if (sourceGenres.length && JSON.stringify(strings(frontmatter.source_genres)) !== JSON.stringify(sourceGenres)) {
    frontmatter.source_genres = sourceGenres;
    canonicalKeys.push("source_genres");
  }
  if (frontmatter.media_type === "anime" && studios.length && JSON.stringify(strings(frontmatter.studios)) !== JSON.stringify(studios)) {
    frontmatter.studios = studios;
    canonicalKeys.push("studios");
  }
  if (!stringValue(frontmatter.season).trim() && season.season) {
    frontmatter.season = season.season;
    canonicalKeys.push("season");
  }
  if (!Number.isInteger(Number(frontmatter.season_year)) && season.seasonYear !== null) {
    frontmatter.season_year = season.seasonYear;
    canonicalKeys.push("season_year");
  }
  const anilistId = stringValue(frontmatter.classification_anilist_id).trim();
  if (!stringValue(frontmatter.anilist_id).trim() && anilistId) {
    frontmatter.anilist_id = anilistId;
    canonicalKeys.push("anilist_id");
  }
  const sourceMaterial = stringValue(frontmatter.classification_source_material, stringValue(frontmatter.classification_source)).trim();
  if (!stringValue(frontmatter.source_material).trim() && sourceMaterial) {
    frontmatter.source_material = sourceMaterial;
    canonicalKeys.push("source_material");
  }

  for (const key of removedKeys) delete frontmatter[key];
  return { changed: true, removedKeys, canonicalKeys: unique(canonicalKeys) };
}
