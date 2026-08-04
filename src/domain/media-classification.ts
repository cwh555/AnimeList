import { normalizeAnimeStudios, normalizeGenres } from "./media-metadata";
import { asArray, stringValue } from "./value-normalization";

export const MEDIA_TAG_MIN_RANK = 60;

export type MediaSeason = "winter" | "spring" | "summer" | "fall";

export interface MediaTagMetadata {
  name: string;
  category: string;
  rank: number;
  isGeneralSpoiler: boolean;
  isMediaSpoiler: boolean;
  isAdult: boolean;
}

export interface MediaClassification {
  anilistId: string;
  genres: string[];
  tags: MediaTagMetadata[];
  season: MediaSeason | null;
  seasonYear: number | null;
  studios: string[];
  source: string;
  countryOfOrigin: string;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeSeason(value: unknown): MediaSeason | null {
  const season = stringValue(value).toLocaleLowerCase();
  return season === "winter" || season === "spring" || season === "summer" || season === "fall"
    ? season
    : null;
}

export function normalizeAniListClassification(value: unknown): MediaClassification | null {
  const media = record(value);
  const anilistId = stringValue(media.id).trim();
  if (!anilistId) return null;

  const tags = asArray(media.tags).map((rawTag): MediaTagMetadata | null => {
    const tag = record(rawTag);
    const name = stringValue(tag.name).trim();
    if (!name) return null;
    return {
      name,
      category: stringValue(tag.category).trim(),
      rank: Math.max(0, Math.min(100, optionalInteger(tag.rank) ?? 0)),
      isGeneralSpoiler: tag.isGeneralSpoiler === true,
      isMediaSpoiler: tag.isMediaSpoiler === true,
      isAdult: tag.isAdult === true,
    };
  }).filter((tag): tag is MediaTagMetadata => tag !== null);

  const studios = normalizeAnimeStudios(asArray(record(media.studios).nodes));

  return {
    anilistId,
    genres: normalizeGenres(media.genres),
    tags,
    season: normalizeSeason(media.season),
    seasonYear: optionalInteger(media.seasonYear),
    studios,
    source: stringValue(media.source).trim().toLocaleLowerCase(),
    countryOfOrigin: stringValue(media.countryOfOrigin).trim().toUpperCase(),
  };
}

export function persistedMediaTags(
  classification: MediaClassification | null | undefined,
  minimumRank = MEDIA_TAG_MIN_RANK,
): string[] {
  if (!classification) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const tag of classification.tags) {
    const name = tag.name.normalize("NFKC").trim();
    if (!name || tag.rank < minimumRank || tag.isGeneralSpoiler || tag.isMediaSpoiler || seen.has(name)) continue;
    seen.add(name);
    output.push(name);
  }
  return output;
}
