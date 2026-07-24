import { requestUrl } from "obsidian";
import { attachAniListGenres, attachAniListTags, type AniListTagInput } from "./media-classification";
import type { ExternalMediaResult, MediaType } from "./types";

interface AniListClassificationMedia {
  id?: number | null;
  genres?: string[] | null;
  tags?: AniListTagInput[] | null;
  startDate?: { year?: number | null } | null;
}

interface AniListClassificationPayload {
  data?: { Page?: { media?: AniListClassificationMedia[] | null } | null } | null;
  errors?: Array<{ message?: string | null }> | null;
}

const QUERY = `
  query ($search: String, $type: MediaType, $format: MediaFormat) {
    Page(page: 1, perPage: 20) {
      media(search: $search, type: $type, format: $format, sort: SEARCH_MATCH) {
        id
        genres
        tags { id name category rank isAdult isGeneralSpoiler isMediaSpoiler }
        startDate { year }
      }
    }
  }
`;

export async function fetchAniListClassifications(
  mediaType: MediaType,
  query: string,
  userAgent: string,
): Promise<Map<string, Pick<ExternalMediaResult, "genres" | "tags" | "year">>> {
  const response = await requestUrl({
    url: "https://graphql.anilist.co",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": userAgent,
    },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        search: query,
        type: mediaType === "anime" ? "ANIME" : "MANGA",
        format: mediaType === "novel" ? "NOVEL" : null,
      },
    }),
  });
  const payload = (response.json ?? JSON.parse(response.text || "{}")) as AniListClassificationPayload;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join("; ") || "AniList classification query failed.");
  }
  const output = new Map<string, Pick<ExternalMediaResult, "genres" | "tags" | "year">>();
  for (const media of payload.data?.Page?.media ?? []) {
    if (media.id == null) continue;
    output.set(String(media.id), {
      genres: attachAniListGenres(media.genres),
      tags: attachAniListTags(media.tags),
      year: media.startDate?.year ?? "",
    });
  }
  return output;
}

export function mergeAniListClassifications(
  results: ExternalMediaResult[],
  classifications: ReadonlyMap<string, Pick<ExternalMediaResult, "genres" | "tags" | "year">>,
): ExternalMediaResult[] {
  return results.map((result) => {
    const classification = classifications.get(String(result.sourceId));
    if (!classification) return { ...result, genres: [], tags: [] };
    return {
      ...result,
      genres: classification.genres,
      tags: classification.tags,
      year: classification.year || result.year,
    };
  });
}
