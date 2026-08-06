import type {
  ExternalMediaResult,
  ExternalMediaSourceRef,
} from "../domain/media-types";
import { normalizeSearchComparable } from "../search";
import { AniListClient } from "./providers/anilist-client";

function sourceRefs(result: ExternalMediaResult): ExternalMediaSourceRef[] {
  const refs = result.sources?.length
    ? result.sources
    : result.sourceId
      ? [{ provider: result.provider, sourceId: result.sourceId, sourceUrl: result.sourceUrl }]
      : [];
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.provider}:${ref.sourceId}`;
    if (!ref.sourceId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueSources(...results: ExternalMediaResult[]): ExternalMediaSourceRef[] {
  const seen = new Set<string>();
  const output: ExternalMediaSourceRef[] = [];
  for (const result of results) {
    for (const ref of sourceRefs(result)) {
      const key = `${ref.provider}:${ref.sourceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(ref);
    }
  }
  return output;
}

function titleKeys(result: ExternalMediaResult): Set<string> {
  return new Set([
    result.title,
    result.originalTitle,
    result.romajiTitle,
    ...(result.searchTitles ?? []),
  ].map((value) => normalizeSearchComparable(value)).filter(Boolean));
}

function numericYear(value: number | string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function candidateScore(source: ExternalMediaResult, candidate: ExternalMediaResult): number | null {
  const sourceTitles = titleKeys(source);
  const candidateTitles = titleKeys(candidate);
  const exactTitleMatch = [...sourceTitles].some((title) => candidateTitles.has(title));
  if (!exactTitleMatch) return null;

  const sourceYear = numericYear(source.year);
  const candidateYear = numericYear(candidate.year);
  if (sourceYear !== null && candidateYear !== null && Math.abs(sourceYear - candidateYear) > 1) return null;

  let score = 100;
  if (sourceYear !== null && candidateYear !== null) score += sourceYear === candidateYear ? 20 : 8;
  if (source.format && candidate.format && source.format === candidate.format) score += 10;
  if (normalizeSearchComparable(source.originalTitle)
    && normalizeSearchComparable(source.originalTitle) === normalizeSearchComparable(candidate.originalTitle)) {
    score += 15;
  }
  return score;
}

function uniqueCandidates(results: ExternalMediaResult[]): ExternalMediaResult[] {
  const byId = new Map<string, ExternalMediaResult>();
  for (const result of results) {
    if (!result.sourceId || byId.has(result.sourceId)) continue;
    byId.set(result.sourceId, result);
  }
  return [...byId.values()];
}

function mergeClassification(source: ExternalMediaResult, anilist: ExternalMediaResult): ExternalMediaResult {
  if (!anilist.classification) return source;
  const classification = anilist.classification;
  return {
    ...source,
    genres: classification.genres.length ? classification.genres : source.genres,
    people: source.mediaType === "anime" && classification.studios.length
      ? classification.studios
      : source.people,
    sources: uniqueSources(source, anilist),
    classification,
  };
}

export class MediaClassificationService {
  constructor(private readonly anilist: AniListClient) {}

  private anilistSourceId(result: ExternalMediaResult): string {
    if (result.provider === "anilist" && result.sourceId) return result.sourceId;
    return sourceRefs(result).find((source) => source.provider === "anilist")?.sourceId ?? "";
  }

  private lookupQueries(result: ExternalMediaResult): string[] {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const value of [result.originalTitle, result.romajiTitle, result.title, ...(result.searchTitles ?? [])]) {
      const clean = value.normalize("NFKC").replace(/\s+/g, " ").trim();
      const key = normalizeSearchComparable(clean);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      output.push(clean);
      if (output.length >= 3) break;
    }
    return output;
  }

  private selectCandidate(source: ExternalMediaResult, candidates: ExternalMediaResult[]): ExternalMediaResult | null {
    const scored = uniqueCandidates(candidates)
      .map((candidate) => ({ candidate, score: candidateScore(source, candidate) }))
      .filter((entry): entry is { candidate: ExternalMediaResult; score: number } => entry.score !== null)
      .sort((left, right) => right.score - left.score);
    if (!scored.length) return null;
    if (scored.length > 1 && scored[0].score === scored[1].score) return null;
    return scored[0].candidate;
  }

  async enrich(result: ExternalMediaResult): Promise<ExternalMediaResult> {
    if (result.classification?.anilistId) {
      return mergeClassification(result, result);
    }

    const knownAniListId = this.anilistSourceId(result);
    if (knownAniListId) {
      const direct = await this.anilist.fetchMediaById(result.mediaType, knownAniListId);
      return direct ? mergeClassification(result, direct) : result;
    }

    const queries = this.lookupQueries(result);
    if (!queries.length) return result;
    const pages = await this.anilist.searchPages(result.mediaType, queries, 1);
    const candidate = this.selectCandidate(result, pages.flatMap((page) => page.results));
    return candidate ? mergeClassification(result, candidate) : result;
  }
  async enrichOrOriginal(
    result: ExternalMediaResult,
    onError?: (error: unknown) => void,
  ): Promise<ExternalMediaResult> {
    try {
      return await this.enrich(result);
    } catch (error) {
      onError?.(error);
      return result;
    }
  }

}
