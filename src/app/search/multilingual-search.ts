import { buildSearchQueryPlan } from "../../domain/search/query-plan";
import {
  filterRelevantSearchResults,
  normalizeSearchComparable,
  rankSearchResults,
  scoreSearchResult,
  searchQueryVariants,
} from "../../domain/search/ranking";
import type {
  ExternalMediaResult,
  SearchLanguage,
  SearchLanguageSettings,
} from "../../types";

export interface SearchProviderAdapter {
  label: string;
  supportsChineseDiscovery?: boolean;
  search(query: string): Promise<ExternalMediaResult[]>;
  searchMany?(queries: string[]): Promise<ExternalMediaResult[][]>;
}

export interface MultilingualSearchOptions {
  query: string;
  providers: SearchProviderAdapter[];
  languages?: SearchLanguageSettings;
  dedupe?: (results: ExternalMediaResult[]) => ExternalMediaResult[];
  maxResults?: number;
}

export interface MultilingualSearchResponse {
  results: ExternalMediaResult[];
  warnings: string[];
  expandedQueries: string[];
}

interface ProviderQueryOutcome {
  readonly provider: string;
  readonly results: ExternalMediaResult[];
  readonly error?: unknown;
}

export const DEFAULT_SEARCH_LANGUAGES: SearchLanguageSettings = {
  chinese: true,
  english: true,
  original: true,
};

const MAX_EXPANSION_QUERIES = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeSearchLanguageSettings(value: unknown): SearchLanguageSettings {
  const record = isRecord(value) ? value : {};
  return {
    chinese: typeof record.chinese === "boolean" ? record.chinese : DEFAULT_SEARCH_LANGUAGES.chinese,
    english: typeof record.english === "boolean" ? record.english : DEFAULT_SEARCH_LANGUAGES.english,
    original: typeof record.original === "boolean" ? record.original : DEFAULT_SEARCH_LANGUAGES.original,
  };
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) || "Unknown error";
  } catch {
    return "Unknown error";
  }
}

function uniqueQueries(values: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const clean = String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
    const key = normalizeSearchComparable(clean);
    if (!clean || key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function containsHan(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}

function containsKana(value: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
}

function containsHangul(value: string): boolean {
  return /\p{Script=Hangul}/u.test(value);
}

function containsLatin(value: string): boolean {
  return /\p{Script=Latin}/u.test(value);
}

function inferredLanguageTitles(result: ExternalMediaResult, language: SearchLanguage): string[] {
  const aliases = uniqueQueries([result.title, ...(result.searchTitles ?? [])]);
  if (language === "original") {
    return uniqueQueries([
      result.originalTitle,
      result.romajiTitle,
      ...aliases.filter((title) => containsKana(title) || containsHangul(title)),
    ]);
  }
  if (language === "chinese") {
    return aliases.filter((title) => containsHan(title) && !containsKana(title) && !containsHangul(title));
  }
  const originalKeys = new Set([
    normalizeSearchComparable(result.originalTitle),
    normalizeSearchComparable(result.romajiTitle),
  ].filter(Boolean));
  return aliases.filter((title) => (
    containsLatin(title)
    && !containsHan(title)
    && !containsKana(title)
    && !containsHangul(title)
    && !originalKeys.has(normalizeSearchComparable(title))
  ));
}

export function collectMultilingualSearchQueries(
  query: string,
  results: ExternalMediaResult[],
  languages: SearchLanguageSettings = DEFAULT_SEARCH_LANGUAGES,
  limit = MAX_EXPANSION_QUERIES,
): string[] {
  const existingKeys = new Set(searchQueryVariants(query).map(normalizeSearchComparable));
  const candidates = new Map<SearchLanguage, string[]>();
  for (const language of ["chinese", "english", "original"] as SearchLanguage[]) {
    if (!languages[language]) continue;
    candidates.set(language, uniqueQueries(results.flatMap((result) => inferredLanguageTitles(result, language))));
  }

  const output: string[] = [];
  const add = (candidate: string): void => {
    const key = normalizeSearchComparable(candidate);
    if (!key || existingKeys.has(key) || output.some((value) => normalizeSearchComparable(value) === key)) return;
    output.push(candidate);
  };

  for (const language of ["chinese", "english", "original"] as SearchLanguage[]) {
    const candidate = candidates.get(language)?.[0];
    if (candidate) add(candidate);
    if (output.length >= limit) return output;
  }
  for (const language of ["chinese", "english", "original"] as SearchLanguage[]) {
    for (const candidate of candidates.get(language) ?? []) {
      add(candidate);
      if (output.length >= limit) return output;
    }
  }
  return output;
}

function defaultDedupe(results: ExternalMediaResult[]): ExternalMediaResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.provider}:${result.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function runProviderQueries(
  providers: SearchProviderAdapter[],
  queries: string[],
): Promise<{ results: ExternalMediaResult[]; warnings: string[] }> {
  // Keep providers independent, but avoid bursts of concurrent searches to a
  // single provider. AniList can still batch variants in one GraphQL call.
  const settled: ProviderQueryOutcome[] = await Promise.all(providers.map(async provider => {
    if (provider.searchMany && queries.length > 1) {
      try {
        return { provider: provider.label, results: (await provider.searchMany(queries)).flat() };
      } catch (error: unknown) {
        return { provider: provider.label, results: [], error };
      }
    }
    const results: ExternalMediaResult[] = [];
    for (const query of queries) {
      try {
        results.push(...await provider.search(query));
      } catch (error: unknown) {
        // Preserve successful variants, but do not repeatedly hit a failing API.
        return { provider: provider.label, results, error };
      }
    }
    return { provider: provider.label, results };
  }));
  return {
    results: settled.flatMap(outcome => outcome.results),
    warnings: settled
      .filter(outcome => outcome.error !== undefined)
      .map(outcome => `${outcome.provider}: ${errorMessage(outcome.error)}`),
  };
}

export async function searchMultilingualProviders(
  options: MultilingualSearchOptions,
): Promise<MultilingualSearchResponse> {
  const query = options.query.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!query || !options.providers.length) {
    return {
      results: [],
      warnings: options.providers.length ? [] : ["No metadata provider is enabled."],
      expandedQueries: [],
    };
  }

  const languages = normalizeSearchLanguageSettings(options.languages);
  const dedupe = options.dedupe ?? defaultDedupe;
  const plan = buildSearchQueryPlan(query, languages);
  const initialQueries = [...plan.initial];
  const initial = await runProviderQueries(options.providers, initialQueries);
  const initialUnique = dedupe(initial.results);
  const initialSeeds = rankSearchResults(initialUnique, query)
    .filter((result) => scoreSearchResult(result, query) >= 36)
    .slice(0, 6);

  const discoveryProviders = languages.chinese && initialSeeds.length < 2
    ? options.providers.filter((provider) => provider.supportsChineseDiscovery)
    : [];
  const discoveryQueries = discoveryProviders.length ? [...plan.discovery] : [];
  const discovery = discoveryQueries.length
    ? await runProviderQueries(discoveryProviders, discoveryQueries)
    : { results: [], warnings: [] };

  const seedPool = dedupe([...initial.results, ...discovery.results]);
  const seedResults = rankSearchResults(seedPool, query, discoveryQueries)
    .filter((result) => scoreSearchResult(result, query, discoveryQueries) >= 36)
    .slice(0, 8);
  const aliasQueries = collectMultilingualSearchQueries(query, seedResults, languages);
  const expanded = aliasQueries.length
    ? await runProviderQueries(options.providers, aliasQueries)
    : { results: [], warnings: [] };

  const relatedQueries = uniqueQueries([...discoveryQueries, ...aliasQueries]);
  const merged = dedupe([...initial.results, ...discovery.results, ...expanded.results]);
  const relevant = filterRelevantSearchResults(merged, query, relatedQueries);
  return {
    results: rankSearchResults(relevant, query, relatedQueries).slice(0, options.maxResults ?? 24),
    warnings: [...new Set([...initial.warnings, ...discovery.warnings, ...expanded.warnings])],
    expandedQueries: relatedQueries,
  };
}
