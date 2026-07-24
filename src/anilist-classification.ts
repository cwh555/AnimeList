import { requestUrl } from "obsidian";
import { attachAniListGenres, attachAniListTags, type AniListTagInput } from "./media-classification";
import type { ExternalMediaResult } from "./types";

interface AniListClassificationMedia {
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

type AniListClassification = Pick<ExternalMediaResult, "genres" | "tags" | "year" | "people">;

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
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
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
  if (!ids.length) return output;

  const mediaGroups = await Promise.all(chunks(ids, 50).map((group) => fetchChunk(group, userAgent)));
  for (const media of mediaGroups.flat()) {
    if (media.id == null) continue;
    const people = (media.studios?.nodes ?? [])
      .map((studio) => studio?.name?.trim() ?? "")
      .filter(Boolean);
    output.set(String(media.id), {
      genres: attachAniListGenres(media.genres),
      tags: attachAniListTags(media.tags),
      year: media.startDate?.year ?? "",
      people,
    });
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
    if (!classification) return { ...result };
    return {
      ...result,
      genres: classification.genres,
      tags: classification.tags,
      year: classification.year || result.year,
      people: result.mediaType === "anime" && classification.people.length
        ? [...classification.people]
        : [...result.people],
    };
  });
}
