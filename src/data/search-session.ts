import type { ExternalMediaResult, MediaType } from "../domain/media-types";
import { rankSearchResults, scoreSearchResult } from "../domain/search/ranking";
import type { MetadataProviderId, MetadataProviderPage } from "./external-media-provider";
import { dedupeSearchResults } from "./provider-normalizers";

export interface SearchCursor {
  readonly provider: MetadataProviderId;
  readonly query: string;
  nextPage: number;
}

const PAGE_LIMIT = 24;
const TOTAL_LIMIT = 72;

/**
 * Per-query pagination state. The next page consumes undisplayed results
 * before sending additional requests using the same expanded queries.
 */
export class SearchSession {
  readonly query: string;
  readonly mediaType: MediaType;
  readonly relatedQueries: readonly string[];
  nextPage = 2;
  private pending: ExternalMediaResult[];
  private readonly delivered = new Set<string>();
  private readonly cursors: SearchCursor[];

  constructor(
    mediaType: MediaType,
    query: string,
    relatedQueries: readonly string[],
    initial: readonly ExternalMediaResult[],
    cursors: readonly SearchCursor[],
  ) {
    this.mediaType = mediaType;
    this.query = query;
    this.relatedQueries = [...relatedQueries];
    this.pending = [...initial];
    this.cursors = cursors.map(cursor => ({ ...cursor }));
  }

  private key(result: ExternalMediaResult): string {
    return JSON.stringify([result.provider, result.sourceId]);
  }

  takePage(): ExternalMediaResult[] {
    const output: ExternalMediaResult[] = [];
    while (output.length < PAGE_LIMIT && this.pending.length && this.delivered.size < TOTAL_LIMIT) {
      const candidate = this.pending.shift();
      if (!candidate) break;
      const key = this.key(candidate);
      if (this.delivered.has(key)) continue;
      this.delivered.add(key);
      output.push(candidate);
    }
    return output;
  }

  addCandidates(results: readonly ExternalMediaResult[]): void {
    if (!results.length) return;
    const all = dedupeSearchResults([...this.pending, ...results]);
    this.pending = rankSearchResults(
      all.filter(result => !this.delivered.has(this.key(result)))
        .filter(result => scoreSearchResult(result, this.query, [...this.relatedQueries]) >= 36),
      this.query, [...this.relatedQueries],
    ).slice(0, TOTAL_LIMIT - this.delivered.size);
  }

  nextCursor(): SearchCursor | undefined {
    return this.cursors.shift();
  }

  advanceCursor(cursor: SearchCursor, page: MetadataProviderPage): void {
    if (!page.hasMore) return;
    this.cursors.push({ ...cursor, nextPage: cursor.nextPage + 1 });
  }

  get hasMore(): boolean {
    return this.delivered.size < TOTAL_LIMIT && (this.pending.length > 0 || this.cursors.length > 0);
  }
}
