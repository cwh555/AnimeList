import { requestAniListGraphQL } from "./anilist-client";
import { attachAniListGenres } from "./media-classification";
import { releaseDateMetadata } from "./release-season";
import type { ExternalMediaResult, MediaType } from "./types";

const USER_AGENT = "AnimeList-Obsidian/1.1.2 (local personal media library)";
const QUERY = `
  query ($search: String, $type: MediaType, $format: MediaFormat) {
    Page(page: 1, perPage: 20) {
      media(search: $search, type: $type, format: $format, sort: SEARCH_MATCH) {
        id siteUrl type format status episodes chapters volumes averageScore description(asHtml: false) genres synonyms
        tags { id name category rank isAdult isGeneralSpoiler isMediaSpoiler }
        startDate { year month day }
        title { romaji english native }
        coverImage { extraLarge large medium }
        studios(isMain: true) { nodes { name } }
        staff(perPage: 10, sort: RELEVANCE) { edges { role node { name { full native } } } }
      }
    }
  }
`;

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function searchAniListCanonical(
  mediaType: MediaType,
  query: string,
  normalize: (value: unknown, mediaType: MediaType) => ExternalMediaResult,
): Promise<ExternalMediaResult[]> {
  const variables = {
    search: query,
    type: mediaType === "anime" ? "ANIME" : "MANGA",
    format: mediaType === "novel" ? "NOVEL" : null,
  };
  const payload = await requestAniListGraphQL<{ Page?: { media?: unknown[] | null } | null }>(
    QUERY,
    variables,
    USER_AGENT,
    { cacheKey: `search:${mediaType}:${query.normalize("NFKC").trim().toLocaleLowerCase()}` },
  );
  let media = asArray(payload.Page?.media);
  if (mediaType === "manga") {
    media = media.filter((item) => !isRecord(item) || stringValue(item.format).toUpperCase() !== "NOVEL");
  }
  return media.map((item) => {
    const result = normalize(item, mediaType);
    const record = isRecord(item) ? item : {};
    const startDate = isRecord(record.startDate) ? record.startDate : {};
    const release = releaseDateMetadata(startDate.year, startDate.month);
    return {
      ...result,
      year: release.year || result.year,
      season: release.season,
      genres: attachAniListGenres(record.genres, asArray(record.tags as unknown[] | null | undefined)),
      tags: [],
    };
  });
}
