import type { App, TFile } from "obsidian";
import { normalizeAnimeStudios, normalizeBroadGenres } from "../domain/media-metadata";
import type { MediaType } from "../domain/media-types";
import type { LegacyMetadataCleanupResult } from "../domain/legacy-metadata-types";
import { asArray, stringValue } from "../domain/value-normalization";
import { CURRENT_MEDIA_SCHEMA_VERSION } from "../schema-migration";
import { getScopedMarkdownFiles } from "../vault-scope";

export interface LegacyMetadataCleanupChange {
  changed: boolean;
  genres: boolean;
  sourceGenres: boolean;
  studios: boolean;
}

const LEGACY_GENRE_NOISE = [
  /^\d{4}(?:年(?:\d{1,2}月)?)?$/,
  /^(?:tv|ova|ona|web|movie)$/i,
  /^(?:劇場版|剧场版)$/i,
  /(?:漫[画畫]改|漫改|輕改|轻改|小說改|小说改|改編|改编)/i,
  /(?:製作委員会|制作委員会|製作委員會|制作委員會|製作委员会|制作委员会)/i,
];

function isMediaType(value: unknown): value is MediaType {
  return value === "anime" || value === "manga" || value === "novel";
}

function strings(value: unknown): string[] {
  return asArray(value)
    .map((entry) => stringValue(entry).normalize("NFKC").trim())
    .filter(Boolean);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasLegacyGenreNoise(values: readonly string[], studios: readonly string[]): boolean {
  const studioSet = new Set(studios.map((value) => value.toLocaleLowerCase()));
  return values.some((value) => {
    const clean = value.normalize("NFKC").trim();
    return LEGACY_GENRE_NOISE.some((pattern) => pattern.test(clean))
      || studioSet.has(clean.toLocaleLowerCase());
  });
}

function setOptionalArray(frontmatter: Record<string, unknown>, key: string, values: string[]): boolean {
  const previous = strings(frontmatter[key]);
  if (sameStrings(previous, values)) return false;
  if (values.length) frontmatter[key] = values;
  else delete frontmatter[key];
  return true;
}

/**
 * Clean only metadata shapes known to have been written by older AnimeList
 * builds. The function deliberately leaves unrelated frontmatter untouched.
 */
export function cleanupLegacyMediaFrontmatter(
  frontmatter: Record<string, unknown>,
): LegacyMetadataCleanupChange {
  const mediaType = frontmatter.media_type;
  if (!isMediaType(mediaType)) {
    return { changed: false, genres: false, sourceGenres: false, studios: false };
  }

  let studiosChanged = false;
  let cleanedStudios: string[] = [];
  if (mediaType === "anime") {
    const previousStudios = strings(frontmatter.studios);
    cleanedStudios = normalizeAnimeStudios(previousStudios);
    if (!sameStrings(previousStudios, cleanedStudios)) {
      studiosChanged = setOptionalArray(frontmatter, "studios", cleanedStudios);
    }
  }

  let genresChanged = false;
  let sourceGenresChanged = false;
  if (stringValue(frontmatter.source_provider).toLocaleLowerCase() === "bangumi") {
    const genres = strings(frontmatter.genres);
    const sourceGenres = strings(frontmatter.source_genres);
    const contaminated = hasLegacyGenreNoise(genres, cleanedStudios)
      || hasLegacyGenreNoise(sourceGenres, cleanedStudios);

    if (contaminated) {
      const cleanedGenres = normalizeBroadGenres(genres);
      if (!sameStrings(genres, cleanedGenres)) {
        frontmatter.genres = cleanedGenres;
        genresChanged = true;
      }
      if (sourceGenres.length) {
        const cleanedSourceGenres = normalizeBroadGenres(sourceGenres)
          .filter((value) => !cleanedGenres.includes(value));
        sourceGenresChanged = setOptionalArray(frontmatter, "source_genres", cleanedSourceGenres);
      }
    }
  }

  const changed = studiosChanged || genresChanged || sourceGenresChanged;
  if (changed) frontmatter.schema_version = CURRENT_MEDIA_SCHEMA_VERSION;
  return {
    changed,
    genres: genresChanged,
    sourceGenres: sourceGenresChanged,
    studios: studiosChanged,
  };
}

function cleanupCandidate(frontmatter: Record<string, unknown>): boolean {
  const copy: Record<string, unknown> = {
    ...frontmatter,
    genres: strings(frontmatter.genres),
    source_genres: strings(frontmatter.source_genres),
    studios: strings(frontmatter.studios),
  };
  return cleanupLegacyMediaFrontmatter(copy).changed;
}

export async function cleanupLegacyMetadataNotes(
  app: App,
  roots: string[],
  concurrency = 8,
): Promise<LegacyMetadataCleanupResult> {
  const mediaFiles = getScopedMarkdownFiles(app, roots).filter((file) => {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    return Boolean(frontmatter && isMediaType(frontmatter.media_type));
  });
  const candidates = mediaFiles.filter((file) => {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    return Boolean(frontmatter && cleanupCandidate(frontmatter));
  });
  const result: LegacyMetadataCleanupResult = {
    scanned: mediaFiles.length,
    cleaned: 0,
    genres: 0,
    sourceGenres: 0,
    studios: 0,
  };

  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < candidates.length) {
      const file: TFile = candidates[nextIndex];
      nextIndex += 1;
      let change: LegacyMetadataCleanupChange = {
        changed: false,
        genres: false,
        sourceGenres: false,
        studios: false,
      };
      await app.fileManager.processFrontMatter(file, (frontmatter) => {
        change = cleanupLegacyMediaFrontmatter(frontmatter);
      });
      if (!change.changed) continue;
      result.cleaned += 1;
      if (change.genres) result.genres += 1;
      if (change.sourceGenres) result.sourceGenres += 1;
      if (change.studios) result.studios += 1;
    }
  };

  const workers = Math.min(candidates.length, Math.max(1, Math.floor(concurrency)));
  if (workers > 0) await Promise.all(Array.from({ length: workers }, () => worker()));
  return result;
}
