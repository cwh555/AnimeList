import { requestUrl } from "obsidian";
import {
  attachAniListGenres,
  attachAniListTags,
  createAutomaticSelection,
  type AniListTagInput,
} from "./media-classification";
import type { ExternalMediaResult } from "./types";

export interface AniListClassificationMedia {
  id?: number | null;
  genres?: string[] | null;
  tags?: AniListTagInput[] | null;
  startDate?: { year?: number | null } | null;
  studios?: { nodes?: Array<{ name?: string | null } | null> | null } | null;
}

interface AniListClassificationPayload {
  data?: { Page?: { media?: AniListClassificationMedia[] | null } | null } | null;
  errors?: Array<{ message?: string | null }> | null;
}

export type AniListClassification = Pick<ExternalMediaResult, "genres" | "tags" | "year" | "people">;

const CLASSIFICATION_CACHE = new Map<string, AniListClassification>();

const QUERY = `
  query ($ids: [Int]) {
    Page(page: 1, perPage: 50) {
      media(id_in: $ids, sort: ID) {
        id
        genres
        tags { id name category rank isAdult isGeneralSpoiler isMediaSpoiler }
        startDate { year }
        studios(isMain: true) { nodes { name } }
      }
    }
  }
`;

function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

export function classificationFromAniListMedia(media: AniListClassificationMedia): AniListClassification {
  const people = (media.studios?.nodes ?? [])
    .map((studio) => studio?.name?.trim() ?? "")
    .filter(Boolean);
  return {
    genres: attachAniListGenres(media.genres, media.tags),
    tags: attachAniListTags(media.tags),
    year: media.startDate?.year ?? "",
    people,
  };
}

async function fetchChunk(ids: number[], userAgent: string): Promise<AniListClassificationMedia[]> {
  const response = await requestUrl({
    url: "https://graphql.anilist.co",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": userAgent,
    },
    body: JSON.stringify({ query: QUERY, variables: { ids } }),
  });
  const payload = (response.json ?? JSON.parse(response.text || "{}")) as AniListClassificationPayload;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join("; ") || "AniList classification query failed.");
  }
  return payload.data?.Page?.media ?? [];
}

export async function fetchAniListClassifications(
  results: readonly ExternalMediaResult[],
  userAgent: string,
): Promise<Map<string, AniListClassification>> {
  const ids = [...new Set(results
    .filter((result) => result.provider.toLocaleLowerCase() === "anilist")
    .map((result) => Number(result.sourceId))
    .filter((id) => Number.isInteger(id) && id > 0))];
  const output = new Map<string, AniListClassification>();
  const missing: number[] = [];
  for (const id of ids) {
    const cached = CLASSIFICATION_CACHE.get(String(id));
    if (cached) output.set(String(id), cached);
    else missing.push(id);
  }
  if (!missing.length) return output;

  const mediaGroups = await Promise.all(chunks(missing, 50).map((group) => fetchChunk(group, userAgent)));
  for (const media of mediaGroups.flat()) {
    if (media.id == null) continue;
    const classification = classificationFromAniListMedia(media);
    CLASSIFICATION_CACHE.set(String(media.id), classification);
    output.set(String(media.id), classification);
  }
  return output;
}

export function mergeAniListClassifications(
  results: readonly ExternalMediaResult[],
  classifications: ReadonlyMap<string, AniListClassification>,
): ExternalMediaResult[] {
  return results.map((result) => {
    if (result.provider.toLocaleLowerCase() !== "anilist") return { ...result };
    const classification = classifications.get(String(result.sourceId));
    if (!classification) {
      const fallback = createAutomaticSelection(result.genres, result.tags);
      return { ...result, genres: fallback.genres, tags: fallback.tags };
    }
    return {
      ...result,
      genres: [...classification.genres],
      tags: [...classification.tags],
      year: classification.year || result.year,
      people: result.mediaType === "anime" && classification.people.length
        ? [...classification.people]
        : [...result.people],
    };
  });
}
