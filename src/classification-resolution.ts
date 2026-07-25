import { fetchAniListClassifications, mergeAniListClassifications } from "./anilist-classification";
import { mergeAniListWithLocalizedResult, sameMediaWork } from "./classification-search";
import { scoreSearchResult } from "./search-enhancements";
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

function compatibleFallback(
  selected: ExternalMediaResult,
  query: string,
  candidates: readonly ExternalMediaResult[],
): ExternalMediaResult | null {
  const selectedYear = Number(selected.year);
  const filtered = candidates.filter((candidate) => {
    if (candidate.mediaType !== selected.mediaType) return false;
    if (selected.format && candidate.format && selected.format !== candidate.format) return false;
    const candidateYear = Number(candidate.year);
    if (Number.isFinite(selectedYear) && selectedYear > 0
      && Number.isFinite(candidateYear) && candidateYear > 0
      && selectedYear !== candidateYear) return false;
    return true;
  });
  const ranked = filtered
    .map((candidate) => ({ candidate, score: scoreSearchResult(candidate, query, selected.searchTitles ?? []) }))
    .sort((left, right) => right.score - left.score);
  if (!ranked.length || ranked[0].score < 82) return null;
  if (ranked[1] && ranked[1].score === ranked[0].score) return null;
  return ranked[0].candidate;
}

async function findAniListEquivalent(
  host: AniListClassificationResolverHost,
  selected: ExternalMediaResult,
): Promise<ExternalMediaResult | null> {
  const query = bestQuery(selected);
  if (!query) return null;
  const candidates = await host.searchAniList(selected.mediaType, query);
  return candidates.find((candidate) => sameMediaWork(candidate, selected))
    ?? compatibleFallback(selected, query, candidates);
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
