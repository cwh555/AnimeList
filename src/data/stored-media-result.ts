import type { ExternalMediaResult, ExternalMediaSourceRef, MediaType } from "../domain/media-types";
import { numeric, stringArray, stringValue } from "../domain/value-normalization";
import { compatibleGenres, compatibleSeasonMetadata, compatibleSourceGenres, compatibleStudios } from "./media-frontmatter-compat";
import { normalizeReleaseStatus } from "../novel-progress";
import { hasCanonicalPrimaryAnimeStudio } from "../domain/media-metadata";

function sourceRefs(frontmatter: Record<string, unknown>): ExternalMediaSourceRef[] {
  const output: ExternalMediaSourceRef[] = [];
  const provider = stringValue(frontmatter.source_provider).trim().toLocaleLowerCase();
  const sourceId = stringValue(frontmatter.source_id).trim();
  const urls = stringArray(frontmatter.source_urls);
  if (provider && sourceId) {
    output.push({ provider, sourceId, sourceUrl: urls[0] ?? "" });
  }
  const anilistId = stringValue(frontmatter.anilist_id).trim();
  if (anilistId && !(provider === "anilist" && sourceId === anilistId)) {
    const anilistUrl = urls.find((value) => /anilist\.co\//i.test(value)) ?? "";
    output.push({ provider: "anilist", sourceId: anilistId, sourceUrl: anilistUrl });
  }
  return output;
}

export function storedMediaNeedsClassificationRefresh(
  frontmatter: Record<string, unknown>,
  mediaType: MediaType,
): boolean {
  if (mediaType !== "anime") return false;
  const season = compatibleSeasonMetadata(frontmatter);
  const studios = compatibleStudios(frontmatter);
  const storedStudios = stringArray(frontmatter.studios);
  const storedStudioNeedsRefresh = storedStudios.length > 0
    && !hasCanonicalPrimaryAnimeStudio(storedStudios);
  return !season.season
    || season.seasonYear === null
    || studios.length !== 1
    || storedStudioNeedsRefresh;
}

export function storedMediaExternalResult(
  frontmatter: Record<string, unknown>,
  mediaType: MediaType,
): ExternalMediaResult {
  const urls = stringArray(frontmatter.source_urls);
  const provider = stringValue(frontmatter.source_provider).trim().toLocaleLowerCase() || "local";
  const sourceId = stringValue(frontmatter.source_id).trim();
  const title = stringValue(frontmatter.title).trim();
  const originalTitle = stringValue(frontmatter.title_original).trim();
  const romajiTitle = stringValue(frontmatter.title_romaji).trim();
  const people = mediaType === "anime"
    ? compatibleStudios(frontmatter)
    : stringArray(frontmatter.authors).length
      ? stringArray(frontmatter.authors)
      : stringArray(frontmatter.creators);
  const score = Number(frontmatter.source_score);

  return {
    provider,
    sourceId,
    title,
    originalTitle,
    romajiTitle,
    mediaType,
    format: stringValue(frontmatter.format, mediaType),
    total: Math.max(0, numeric(frontmatter.progress_total)),
    unit: stringValue(frontmatter.progress_unit),
    year: stringValue(frontmatter.year),
    genres: compatibleGenres(frontmatter),
    rawGenres: compatibleSourceGenres(frontmatter),
    people,
    platforms: stringArray(frontmatter.platforms),
    sourceUrl: urls[0] ?? "",
    coverUrl: stringValue(frontmatter.cover_remote),
    summary: "",
    externalScore: Number.isFinite(score) ? score : null,
    releaseStatus: normalizeReleaseStatus(frontmatter.release_status),
    searchTitles: stringArray(frontmatter.title_aliases),
    sources: sourceRefs(frontmatter),
  };
}
