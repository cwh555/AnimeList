import type { SearchLanguageSettings } from "../settings-types";
import { collectChineseDiscoveryQueries } from "./chinese-variants";
import { normalizeSearchComparable, searchQueryVariants } from "./ranking";

/** One search plan shared by provider orchestration and pagination. */
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
  const initial = searchQueryVariants(source);
  const known = new Set(initial.map(normalizeSearchComparable));
  const discovery = languages.chinese
    ? collectChineseDiscoveryQueries(source).filter(value => {
      const key = normalizeSearchComparable(value);
      if (!key || known.has(key)) return false;
      known.add(key);
      return true;
    })
    : [];
  return { source, initial, discovery };
}
