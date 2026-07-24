import {
  fetchAniListClassifications,
  mergeAniListClassifications,
} from "./anilist-classification";
import {
  mergeAniListWithLocalizedResult,
  sameMediaWork,
} from "./classification-search";
import type { ExternalMediaResult, MediaType } from "./types";

const USER_AGENT = "AnimeList-Obsidian/1.1.2 (local personal media library)";

export interface AniListClassificationResolverHost {
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}

function candidateQueries(result: ExternalMediaResult): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of [
    result.originalTitle,
    result.romajiTitle,
    result.title,
    ...(result.searchTitles ?? []),
  ]) {
    const clean = cleanText(value);
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

async function findAniListEquivalent(
  host: AniListClassificationResolverHost,
  selected: ExternalMediaResult,
): Promise<ExternalMediaResult | null> {
  for (const query of candidateQueries(selected)) {
    const candidates = await host.searchAniList(selected.mediaType, query);
    const exact = candidates.find((candidate) => sameMediaWork(candidate, selected));
    if (exact) return exact;
  }
  return null;
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
