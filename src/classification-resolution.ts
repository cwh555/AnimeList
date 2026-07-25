import { fetchAniListClassifications, mergeAniListClassifications } from "./anilist-classification";
import { fetchBangumiSubjectTitles } from "./bangumi-subject";
import { mergeAniListWithLocalizedResult, sameMediaWork } from "./classification-search";
import { scoreSearchResult } from "./search";
import type { ExternalMediaResult, MediaType } from "./types";

const USER_AGENT = "AnimeList-Obsidian/1.1.2 (local personal media library)";

export interface AniListClassificationResolverHost {
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}

function normalizedFormat(value: unknown): string {
  const format = cleanText(value).toLocaleLowerCase().replace(/[\s-]+/g, "_");
  if (format === "novel") return "light_novel";
  if (format === "tv_short") return "tv";
  return format;
}

function uniqueQueries(values: readonly unknown[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const clean = cleanText(value);
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

async function resolverQueries(selected: ExternalMediaResult): Promise<string[]> {
  let providerAliases: string[] = [];
  if (selected.provider.toLocaleLowerCase() === "bangumi") {
    try {
      providerAliases = await fetchBangumiSubjectTitles(selected.sourceId);
    } catch (error) {
      console.warn("AnimeList could not read Bangumi aliases for classification", error);
    }
  }
  return uniqueQueries([
    selected.originalTitle,
    selected.romajiTitle,
    ...providerAliases,
    ...(selected.searchTitles ?? []),
    selected.title,
  ]).slice(0, 6);
}

function compatibleFallback(
  selected: ExternalMediaResult,
  query: string,
  candidates: readonly ExternalMediaResult[],
): ExternalMediaResult | null {
  const selectedYear = Number(selected.year);
  const selectedFormat = normalizedFormat(selected.format);
  const filtered = candidates.filter((candidate) => {
    if (candidate.mediaType !== selected.mediaType) return false;
    const candidateFormat = normalizedFormat(candidate.format);
    if (selectedFormat && candidateFormat && selectedFormat !== candidateFormat) return false;
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
  for (const query of await resolverQueries(selected)) {
    const candidates = await host.searchAniList(selected.mediaType, query);
    const match = candidates.find((candidate) => sameMediaWork(candidate, selected))
      ?? compatibleFallback(selected, query, candidates);
    if (match) return match;
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
