import type { ExternalMediaResult, MediaType } from "../domain/media-types";
import { rankSearchResults, scoreSearchResult } from "../domain/search/ranking";
import { sameMediaIdentity } from "../domain/search/entity-resolution";
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
  private readonly delivered: ExternalMediaResult[] = [];
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

  private wasDelivered(candidate: ExternalMediaResult): boolean {
    return this.delivered.some(previous => sameMediaIdentity(previous, candidate));
  }

  takePage(): ExternalMediaResult[] {
    const output: ExternalMediaResult[] = [];
    while (output.length < PAGE_LIMIT && this.pending.length && this.delivered.length < TOTAL_LIMIT) {
      const candidate = this.pending.shift();
      if (!candidate || this.wasDelivered(candidate)) continue;
      this.delivered.push(candidate);
      output.push(candidate);
    }
    return output;
  }

  addCandidates(results: readonly ExternalMediaResult[]): void {
    if (!results.length) return;
    const all = dedupeSearchResults([...this.pending, ...results]);
    this.pending = rankSearchResults(
      all.filter(result => !this.wasDelivered(result))
        .filter(result => scoreSearchResult(result, this.query, [...this.relatedQueries]) >= 36),
      this.query, [...this.relatedQueries],
    ).slice(0, TOTAL_LIMIT - this.delivered.length);
  }

  nextCursor(): SearchCursor | undefined {
    return this.cursors.shift();
  }

  advanceCursor(cursor: SearchCursor, page: MetadataProviderPage): void {
    if (!page.hasMore) return;
    this.cursors.push({ ...cursor, nextPage: cursor.nextPage + 1 });
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  discardProvider(provider: MetadataProviderId): void {
    for (let i = this.cursors.length - 1; i >= 0; i -= 1) {
      if (this.cursors[i].provider === provider) this.cursors.splice(i, 1);
    }
  }

  get hasMore(): boolean {
    return this.delivered.length < TOTAL_LIMIT && (this.pending.length > 0 || this.cursors.length > 0);
  }
}
