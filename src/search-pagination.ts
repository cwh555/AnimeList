import { legacyTest } from "./legacy";
import type { ExternalMediaResult } from "./types";

export const SEARCH_PAGINATION_LIMITS = {
  pageSize: 24,
  maxLoads: 2,
  maxResults: 72,
} as const;

const dedupeSearchResults = legacyTest.dedupeSearchResults as (
  results: ExternalMediaResult[],
) => ExternalMediaResult[];

export function mergeSearchPages(
  initial: ExternalMediaResult[],
  pages: ExternalMediaResult[][],
): ExternalMediaResult[] {
  const deduped = dedupeSearchResults([initial, ...pages].flat());
  return deduped.slice(0, SEARCH_PAGINATION_LIMITS.maxResults);
}
