import { fetchAniListClassifications, mergeAniListClassifications } from "./anilist-classification";
import { mergeAniListWithLocalizedResult, sameMediaWork } from "./classification-search";
import type { ExternalMediaResult, MediaType } from "./types";

const USER_AGENT = "AnimeList-Obsidian/1.1.2 (local personal media library)";

export interface AniListClassificationResolverHost {
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}

function bestQuery(result: ExternalMediaResult): string {
  return cleanText(result.originalTitle) || cleanText(result.romajiTitle) || cleanText(result.title)
    || (result.searchTitles ?? []).map(cleanText).find(Boolean) || "";
}

async function findAniListEquivalent(
  host: AniListClassificationResolverHost,
  selected: ExternalMediaResult,
): Promise<ExternalMediaResult | null> {
  const query = bestQuery(selected);
  if (!query) return null;
  const candidates = await host.searchAniList(selected.mediaType, query);
  return candidates.find((candidate) => sameMediaWork(candidate, selected)) ?? null;
}

export async function resolveClassifiedMediaResult(
  host: AniListClassificationResolverHost,
  selected: ExternalMediaResult,
): Promise<ExternalMediaResult> {
  let canonical = selected;
  if (selected.provider.toLocaleLowerCase() !== "anilist") {
    const match = await findAniListEquivalent(host, selected);
    if (!match) return { ...selected, genres: [], tags: [] };
    canonical = mergeAniListWithLocalizedResult(match, selected);
  }
  if (canonical.genres.length > 0) return { ...canonical, tags: canonical.tags ?? [] };
  try {
    const classifications = await fetchAniListClassifications([canonical], USER_AGENT);
    const [enriched] = mergeAniListClassifications([canonical], classifications);
    return enriched ?? canonical;
  } catch (error) {
    console.warn("AnimeList could not resolve canonical AniList classification", error);
    const [fallback] = mergeAniListClassifications([canonical], new Map());
    return fallback ?? canonical;
  }
}
