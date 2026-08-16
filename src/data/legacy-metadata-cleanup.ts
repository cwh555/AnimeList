import type { App, TFile } from "obsidian";
import { persistedMediaTags, resolveMediaSeasonMetadata } from "../domain/media-classification";
import { normalizeAnimeStudios, normalizeBroadGenres, normalizeGenres } from "../domain/media-metadata";
import type { ExternalMediaResult, ExternalMediaSourceRef, MediaType } from "../domain/media-types";
import type {
  LegacyMetadataCleanupProgress,
  LegacyMetadataCleanupResult,
  LegacyMetadataEnrichmentStatus,
} from "../domain/legacy-metadata-types";
import { asArray, numeric, stringValue } from "../domain/value-normalization";
import { compatibleGenres, compatibleSeasonMetadata, compatibleSourceGenres, compatibleStudios, legacyClassificationKeys, legacySelectedClassificationTags, migrateLegacyClassificationHeaders } from "./media-frontmatter-compat";
import { CURRENT_MEDIA_SCHEMA_VERSION } from "../app/schema-migration";
import { getScopedMarkdownFiles } from "./vault-scope";

export interface LegacyMetadataCleanupChange {
  changed: boolean;
  genres: boolean;
  sourceGenres: boolean;
  studios: boolean;
  userTags: boolean;
  legacyClassificationKeys: string[];
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
  const genres = compatibleGenres(frontmatter);
  const rawGenres = compatibleSourceGenres(frontmatter);
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
    people: mediaType === "anime" ? compatibleStudios(frontmatter) : strings(frontmatter.authors),
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
  if (legacyClassificationKeys(frontmatter).length) return true;
  const version = Number(frontmatter.schema_version);
  if (!Number.isInteger(version) || version < CURRENT_MEDIA_SCHEMA_VERSION) return true;
  if (!stringValue(frontmatter.anilist_id).trim()) return true;
  if (frontmatter.media_type !== "anime") return false;
  const season = compatibleSeasonMetadata(frontmatter);
  if (!season.season || season.seasonYear === null) return true;
  return compatibleStudios(frontmatter).length === 0;
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
    return { changed: false, genres: false, sourceGenres: false, studios: false, userTags: false, legacyClassificationKeys: [] };
  }

  const legacySelectedTags = legacySelectedClassificationTags(frontmatter);
  const legacyHeaders = migrateLegacyClassificationHeaders(frontmatter);
  const legacyUserTags = normalizeGenres(frontmatter.user_tags, 32);
  let userTagsChanged = false;
  if (legacyUserTags.length) {
    const merged = normalizeGenres([...strings(frontmatter.genres), ...legacyUserTags], 32);
    if (!sameStrings(strings(frontmatter.genres), merged)) {
      frontmatter.genres = merged;
    }
    delete frontmatter.user_tags;
    userTagsChanged = true;
  }

  let studiosChanged = false;
  let cleanedStudios: string[] = [];
  if (mediaType === "anime") {
    const previousStudios = strings(frontmatter.studios);
    cleanedStudios = compatibleStudios(frontmatter);
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
      const cleanedGenres = normalizeGenres([
        ...normalizeBroadGenres(genres),
        ...legacySelectedTags,
        ...legacyUserTags,
      ], 32);
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
    changed: legacyHeaders.changed || studiosChanged || genresChanged || sourceGenresChanged || userTagsChanged,
    genres: genresChanged || legacyHeaders.canonicalKeys.includes("genres"),
    sourceGenres: sourceGenresChanged || legacyHeaders.canonicalKeys.includes("source_genres"),
    studios: studiosChanged || legacyHeaders.canonicalKeys.includes("studios"),
    userTags: userTagsChanged,
    legacyClassificationKeys: legacyHeaders.removedKeys,
  };
}

function localChangedFields(change: LegacyMetadataCleanupChange): string[] {
  const fields: string[] = [];
  if (change.genres) fields.push("genres");
  if (change.sourceGenres) fields.push("source_genres");
  if (change.studios) fields.push("studios");
  if (change.userTags) fields.push("user_tags");
  fields.push(...change.legacyClassificationKeys);
  return fields;
}

function applyAnimeQuarter(
  frontmatter: Record<string, unknown>,
  enriched: ExternalMediaResult,
): string[] {
  if (enriched.mediaType !== "anime") return [];
  const classification = enriched.classification;
  const season = resolveMediaSeasonMetadata({
    season: classification?.season,
    seasonYear: classification?.seasonYear,
    startDate: enriched.startDate,
    fallbackYear: enriched.year,
  });
  if (!season.season) return [];
  const changes: string[] = [];
  if (setOptionalString(frontmatter, "season", season.season)) changes.push("season");
  if (season.seasonYear !== null && setOptionalNumber(frontmatter, "season_year", season.seasonYear)) changes.push("season_year");
  return changes;
}

function applyClassification(
  frontmatter: Record<string, unknown>,
  enriched: ExternalMediaResult,
  seedApiGenres = false,
): string[] {
  const classification = enriched.classification;
  if (!classification) return [];
  const changes: string[] = [];
  if (classification.genres.length && (seedApiGenres || strings(frontmatter.genres).length === 0)) {
    const genres = normalizeGenres(
      seedApiGenres
        ? [...classification.genres, ...strings(frontmatter.genres)]
        : classification.genres,
      32,
    );
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
    changes.push(...applyAnimeQuarter(frontmatter, enriched));
  } else {
    if (enriched.people.length && setOptionalArray(frontmatter, "authors", enriched.people)) changes.push("authors");
    if (setOptionalString(frontmatter, "season", classification.season ?? "")) changes.push("season");
    if (setOptionalNumber(frontmatter, "season_year", classification.seasonYear)) changes.push("season_year");
  }
  if (setOptionalString(frontmatter, "source_material", classification.source)) changes.push("source_material");
  if (setOptionalString(frontmatter, "anilist_id", classification.anilistId)) changes.push("anilist_id");

  const urls = [...new Set([
    ...strings(frontmatter.source_urls),
    enriched.sourceUrl,
    ...(enriched.sources ?? []).map((source) => source.sourceUrl),
  ].filter(Boolean))];
  if (setOptionalArray(frontmatter, "source_urls", urls)) changes.push("source_urls");
  return changes;
}

function applyProviderStudioFallback(
  frontmatter: Record<string, unknown>,
  refreshed: ExternalMediaResult,
): boolean {
  if (refreshed.mediaType !== "anime") return false;
  if (compatibleStudios(frontmatter).length > 0) return false;
  const studios = normalizeAnimeStudios(refreshed.people);
  return studios.length > 0 && setOptionalArray(frontmatter, "studios", studios);
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
    const hadLegacyUserTags = strings(cached.user_tags).length > 0;
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
    let refreshed: ExternalMediaResult | null = null;
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
          refreshed = candidate;
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
      if (refreshed && applyProviderStudioFallback(frontmatter, refreshed)) {
        result.studios += 1;
        changedFields.push("studios");
      }
      if (refreshed) {
        const metadataFields = enriched
          ? applyClassification(frontmatter, enriched, hadLegacyUserTags)
          : applyAnimeQuarter(frontmatter, refreshed);
        if (metadataFields.length) {
          result.classification += 1;
          changedFields.push(...metadataFields);
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
