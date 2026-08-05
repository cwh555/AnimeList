import type { App, TFile } from "obsidian";
import { persistedMediaTags } from "../domain/media-classification";
import { normalizeAnimeStudios, normalizeBroadGenres, normalizeGenres } from "../domain/media-metadata";
import type { ExternalMediaResult, ExternalMediaSourceRef, MediaType } from "../domain/media-types";
import type {
  LegacyMetadataCleanupProgress,
  LegacyMetadataCleanupResult,
  LegacyMetadataEnrichmentStatus,
} from "../domain/legacy-metadata-types";
import { asArray, numeric, stringValue } from "../domain/value-normalization";
import { CURRENT_MEDIA_SCHEMA_VERSION } from "../schema-migration";
import { getScopedMarkdownFiles } from "../vault-scope";

export interface LegacyMetadataCleanupChange {
  changed: boolean;
  genres: boolean;
  sourceGenres: boolean;
  studios: boolean;
}

export interface LegacyMetadataCleanupOptions {
  enrich?: (result: ExternalMediaResult) => Promise<ExternalMediaResult>;
  onProgress?: (progress: LegacyMetadataCleanupProgress) => void;
  apiIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
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

function setOptionalString(frontmatter: Record<string, unknown>, key: string, value: string): boolean {
  const previous = stringValue(frontmatter[key]).trim();
  if (previous === value) return false;
  if (value) frontmatter[key] = value;
  else delete frontmatter[key];
  return true;
}

function setOptionalNumber(frontmatter: Record<string, unknown>, key: string, value: number | null): boolean {
  const previous = Number(frontmatter[key]);
  if (value !== null && Number.isFinite(previous) && previous === value) return false;
  if (value !== null) frontmatter[key] = value;
  else delete frontmatter[key];
  return true;
}

function sourceRefs(frontmatter: Record<string, unknown>): ExternalMediaSourceRef[] {
  const provider = stringValue(frontmatter.source_provider).trim();
  const sourceId = stringValue(frontmatter.source_id).trim();
  const urls = strings(frontmatter.source_urls);
  const refs: ExternalMediaSourceRef[] = [];
  if (provider && sourceId) {
    const providerUrl = urls.find((url) => {
      if (provider === "anilist") return /anilist\.co\//i.test(url);
      if (provider === "bangumi") return /(?:bgm\.tv|bangumi\.tv)\//i.test(url);
      if (provider === "openlibrary") return /openlibrary\.org\//i.test(url);
      return false;
    }) ?? urls[0] ?? "";
    refs.push({ provider, sourceId, sourceUrl: providerUrl });
  }
  const anilistId = stringValue(frontmatter.anilist_id).trim();
  if (anilistId && !refs.some((ref) => ref.provider === "anilist" && ref.sourceId === anilistId)) {
    refs.push({
      provider: "anilist",
      sourceId: anilistId,
      sourceUrl: urls.find((url) => /anilist\.co\//i.test(url)) ?? `https://anilist.co/${frontmatter.media_type === "anime" ? "anime" : "manga"}/${anilistId}`,
    });
  }
  return refs;
}

function legacyResult(frontmatter: Record<string, unknown>): ExternalMediaResult | null {
  const mediaType = frontmatter.media_type;
  if (!isMediaType(mediaType)) return null;
  const provider = stringValue(frontmatter.source_provider, "legacy").trim() || "legacy";
  const refs = sourceRefs(frontmatter);
  const primary = refs.find((ref) => ref.provider === provider);
  const genres = normalizeGenres(frontmatter.genres);
  const rawGenres = normalizeGenres(frontmatter.source_genres);
  const title = stringValue(frontmatter.title).trim();
  return {
    provider,
    sourceId: stringValue(frontmatter.source_id).trim(),
    sourceUrl: primary?.sourceUrl ?? "",
    mediaType,
    title,
    originalTitle: stringValue(frontmatter.title_original, title).trim(),
    romajiTitle: stringValue(frontmatter.title_romaji).trim(),
    format: stringValue(frontmatter.format, mediaType).trim(),
    total: mediaType === "anime" ? numeric(frontmatter.progress_total) : 0,
    unit: stringValue(frontmatter.progress_unit, mediaType === "anime" ? "episode" : mediaType === "manga" ? "chapter" : "volume"),
    year: numeric(frontmatter.year),
    genres,
    rawGenres,
    people: strings(mediaType === "anime" ? frontmatter.studios : frontmatter.authors),
    platforms: strings(frontmatter.platforms),
    coverUrl: stringValue(frontmatter.cover_remote).trim(),
    summary: "",
    externalScore: null,
    releaseStatus: "unknown",
    searchTitles: strings(frontmatter.title_aliases),
    sources: refs,
  };
}

function needsMetadataUpgrade(frontmatter: Record<string, unknown>): boolean {
  const version = Number(frontmatter.schema_version);
  if (!Number.isInteger(version) || version < CURRENT_MEDIA_SCHEMA_VERSION) return true;
  if (!stringValue(frontmatter.anilist_id).trim()) return true;
  return frontmatter.media_type === "anime" && !Number.isInteger(Number(frontmatter.season_year));
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

  return {
    changed: studiosChanged || genresChanged || sourceGenresChanged,
    genres: genresChanged,
    sourceGenres: sourceGenresChanged,
    studios: studiosChanged,
  };
}

function localChangedFields(change: LegacyMetadataCleanupChange): string[] {
  const fields: string[] = [];
  if (change.genres) fields.push("genres");
  if (change.sourceGenres) fields.push("source_genres");
  if (change.studios) fields.push("studios");
  return fields;
}

function applyClassification(
  frontmatter: Record<string, unknown>,
  enriched: ExternalMediaResult,
): string[] {
  const classification = enriched.classification;
  if (!classification) return [];
  const changes: string[] = [];
  if (classification.genres.length) {
    const genres = normalizeGenres(classification.genres);
    if (!sameStrings(strings(frontmatter.genres), genres)) {
      frontmatter.genres = genres;
      changes.push("genres");
    }
  }
  if ("source_genres" in frontmatter) {
    delete frontmatter.source_genres;
    changes.push("source_genres");
  }
  if (setOptionalArray(frontmatter, "media_tags", persistedMediaTags(classification))) changes.push("media_tags");
  if (enriched.mediaType === "anime") {
    if (setOptionalArray(frontmatter, "studios", normalizeAnimeStudios(classification.studios))) changes.push("studios");
  } else if (enriched.people.length && setOptionalArray(frontmatter, "authors", enriched.people)) {
    changes.push("authors");
  }
  if (setOptionalString(frontmatter, "season", classification.season ?? "")) changes.push("season");
  if (setOptionalNumber(frontmatter, "season_year", classification.seasonYear)) changes.push("season_year");
  if (setOptionalString(frontmatter, "source_material", classification.source)) changes.push("source_material");
  if (setOptionalString(frontmatter, "country_of_origin", classification.countryOfOrigin)) changes.push("country_of_origin");
  if (setOptionalString(frontmatter, "anilist_id", classification.anilistId)) changes.push("anilist_id");

  const urls = [...new Set([
    ...strings(frontmatter.source_urls),
    enriched.sourceUrl,
    ...(enriched.sources ?? []).map((source) => source.sourceUrl),
  ].filter(Boolean))];
  if (setOptionalArray(frontmatter, "source_urls", urls)) changes.push("source_urls");
  return changes;
}

function progress(
  callback: LegacyMetadataCleanupOptions["onProgress"],
  phase: LegacyMetadataCleanupProgress["phase"],
  completed: number,
  total: number,
  title: string,
  message: string,
): void {
  callback?.({ phase, completed, total, title, message });
}

export async function cleanupLegacyMetadataNotes(
  app: App,
  roots: string[],
  options: LegacyMetadataCleanupOptions = {},
): Promise<LegacyMetadataCleanupResult> {
  const mediaFiles = getScopedMarkdownFiles(app, roots).filter((file) => {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    return Boolean(frontmatter && isMediaType(frontmatter.media_type));
  });
  const result: LegacyMetadataCleanupResult = {
    scanned: mediaFiles.length,
    cleaned: 0,
    enriched: 0,
    unavailable: 0,
    failed: 0,
    genres: 0,
    sourceGenres: 0,
    studios: 0,
    classification: 0,
    details: [],
  };
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)));
  const interval = Math.max(0, options.apiIntervalMs ?? 2_100);
  let lastApiAt = 0;

  progress(options.onProgress, "scanning", 0, mediaFiles.length, "", `Found ${mediaFiles.length} media notes.`);

  for (let index = 0; index < mediaFiles.length; index += 1) {
    const file: TFile = mediaFiles[index];
    const cached = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!cached) continue;
    const title = stringValue(cached.title, file.basename).trim();
    const metadataUpgrade = needsMetadataUpgrade(cached);
    const localCopy: Record<string, unknown> = {
      ...cached,
      genres: strings(cached.genres),
      source_genres: strings(cached.source_genres),
      studios: strings(cached.studios),
      authors: strings(cached.authors),
      source_urls: strings(cached.source_urls),
      title_aliases: strings(cached.title_aliases),
    };
    const localChange = cleanupLegacyMediaFrontmatter(localCopy);
    let enriched: ExternalMediaResult | null = null;
    let enrichment: LegacyMetadataEnrichmentStatus = "not-needed";
    let enrichmentError = "";

    if (metadataUpgrade && options.enrich) {
      const source = legacyResult(localCopy);
      if (source) {
        const wait = Math.max(0, interval - (Date.now() - lastApiAt));
        if (lastApiAt > 0 && wait > 0) await sleep(wait);
        progress(options.onProgress, "enriching", index, mediaFiles.length, title, `Fetching current AniList metadata for ${title}…`);
        try {
          lastApiAt = Date.now();
          const candidate = await options.enrich(source);
          if (candidate.classification) {
            enriched = candidate;
            enrichment = "enriched";
            result.enriched += 1;
          } else {
            enrichment = "unavailable";
            result.unavailable += 1;
          }
        } catch (error) {
          enrichment = "failed";
          enrichmentError = error instanceof Error ? error.message : String(error);
          result.failed += 1;
          console.warn(`AnimeList legacy metadata enrichment failed for ${file.path}`, error);
        }
      }
    }

    if (!metadataUpgrade && !localChange.changed) {
      progress(options.onProgress, "completed", index + 1, mediaFiles.length, title, `Already current: ${title}`);
      continue;
    }

    progress(options.onProgress, "writing", index, mediaFiles.length, title, `Updating ${title}…`);
    const changedFields: string[] = [];
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      const local = cleanupLegacyMediaFrontmatter(frontmatter);
      if (local.genres) result.genres += 1;
      if (local.sourceGenres) result.sourceGenres += 1;
      if (local.studios) result.studios += 1;
      changedFields.push(...localChangedFields(local));
      if (enriched) {
        const classificationFields = applyClassification(frontmatter, enriched);
        if (classificationFields.length) {
          result.classification += 1;
          changedFields.push(...classificationFields);
        }
      }
      if (metadataUpgrade && enriched?.classification && Number(frontmatter.schema_version) !== CURRENT_MEDIA_SCHEMA_VERSION) {
        frontmatter.schema_version = CURRENT_MEDIA_SCHEMA_VERSION;
        changedFields.push("schema_version");
      }
    });
    const uniqueFields = [...new Set(changedFields)];
    const changed = uniqueFields.length > 0;
    if (changed) result.cleaned += 1;
    if (changed || enrichment === "unavailable" || enrichment === "failed") {
      result.details.push({
        title,
        path: file.path,
        changes: uniqueFields,
        enrichment,
        ...(enrichmentError ? { error: enrichmentError } : {}),
      });
    }
    progress(options.onProgress, "completed", index + 1, mediaFiles.length, title, changed ? `Updated ${title}` : `No changes for ${title}`);
  }

  return result;
}
