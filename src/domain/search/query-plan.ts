import type { SearchLanguageSettings } from "../settings-types";
import { collectChineseDiscoveryQueries, traditionalToSimplifiedQuery } from "./chinese-variants";
import { normalizeSearchComparable, searchQueryVariants } from "./ranking";

/** Strict per-interaction budgets: more ambiguous queries never spawn unbounded requests. */
export const SEARCH_REQUEST_BUDGET = {
  initialQueries: 2,
  discoveryQueries: 2,
  aliasQueries: 3,
  parallelRequestsPerProvider: 2,
} as const;

export interface SearchQueryPlan {
  readonly source: string;
  readonly initial: readonly string[];
  readonly discovery: readonly string[];
}

export function buildSearchQueryPlan(
  input: string,
  languages: SearchLanguageSettings,
): SearchQueryPlan {
  const source = input.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const initial: string[] = [];
  const seen = new Set<string>();
  const add = (value: string, target: string[], max: number): void => {
    const key = normalizeSearchComparable(value);
    if (!value.trim() || !key || seen.has(key) || target.length >= max) return;
    seen.add(key);
    target.push(value);
  };
  // Original query and a useful locale conversion can be sent in parallel.
  add(source, initial, SEARCH_REQUEST_BUDGET.initialQueries);
  if (languages.chinese || languages.english || languages.original) {
    // A seasonless/subtitle prefix is essential for known media editions.
    // Try it ahead of script conversion when the two compete for one slot.
    for (const variant of searchQueryVariants(source).slice(1)) {
      add(variant, initial, SEARCH_REQUEST_BUDGET.initialQueries);
    }
    if (languages.chinese) {
      add(traditionalToSimplifiedQuery(source), initial, SEARCH_REQUEST_BUDGET.initialQueries);
    }
  }

  const discovery: string[] = [];
  if (languages.chinese) {
    // When a broad seasonless query consumed the fast slot, the Chinese
    // conversion is the highest-value fallback.
    add(traditionalToSimplifiedQuery(source), discovery, SEARCH_REQUEST_BUDGET.discoveryQueries);
    for (const variant of collectChineseDiscoveryQueries(source, 8)) {
      add(variant, discovery, SEARCH_REQUEST_BUDGET.discoveryQueries);
    }
  } else {
    for (const variant of searchQueryVariants(source).slice(1)) {
      add(variant, discovery, SEARCH_REQUEST_BUDGET.discoveryQueries);
    }
  }
  return { source, initial, discovery };
}
