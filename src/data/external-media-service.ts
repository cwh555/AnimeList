import type { ProviderSettings, SearchLanguageSettings } from "../domain/settings-types";
import type { ExternalMediaResult, ExternalMediaSearchPage, MediaType } from "../domain/media-types";
import { searchMultilingualProviders, type SearchProviderAdapter } from "../app/search/multilingual-search";
import { rankSearchResults } from "../domain/search/ranking";
import { searchFeatureText } from "../features/search/text";
import {
  enabledMetadataProviders,
  type MetadataProviderClients,
  type MetadataProviderId,
  type MetadataProviderPage,
} from "./external-media-provider";
import { dedupeSearchResults } from "./provider-normalizers";
import { SearchSession, type SearchCursor } from "./search-session";

const PAGE_RESULT_LIMIT = 24;
const MAX_RESULTS = 72;
const MAX_CURSOR_REQUESTS_PER_PAGE = 6;
const MAX_CACHED_SESSIONS = 4;

interface ProviderTaskResult {
  provider: string;
  page?: MetadataProviderPage;
  error?: unknown;
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

function providerTask(provider: string, task: Promise<MetadataProviderPage>): Promise<ProviderTaskResult> {
  return task.then((page) => ({ provider, page })).catch((error: unknown) => ({ provider, error }));
}

export class ExternalMediaSearchService {
  private readonly sessions = new Map<string, SearchSession>();

  constructor(
    private readonly providers: () => ProviderSettings,
    private readonly clients: MetadataProviderClients,
    private readonly languages: () => SearchLanguageSettings = () => ({
      chinese: true,
      english: true,
      original: true,
    }),
  ) {}

  private enabledProviders(mediaType: MediaType) {
    return enabledMetadataProviders(this.providers(), mediaType, this.clients);
  }

  private sessionKey(mediaType: MediaType, query: string): string {
    return JSON.stringify([mediaType, query.normalize("NFKC").trim(), this.providers(), this.languages()]);
  }

  async search(mediaType: MediaType, query: string, onProgress?: (results: ExternalMediaResult[]) => void): Promise<{
    results: ExternalMediaResult[];
    warnings: string[];
    hasMore: boolean;
  }> {
    const sessionKey = this.sessionKey(mediaType, query);
    const cursors = new Map<string, SearchCursor>();
    const rememberPage = (provider: MetadataProviderId, candidate: string, page: MetadataProviderPage): void => {
      const key = JSON.stringify([provider, candidate]);
      if (page.hasMore) cursors.set(key, { provider, query: candidate, nextPage: 2 });
      else cursors.delete(key);
    };
    const providers: SearchProviderAdapter[] = this.enabledProviders(mediaType).map(client => {
      const adapter: SearchProviderAdapter = {
        label: client.label,
        supportsChineseDiscovery: client.supportsChineseDiscovery,
        search: async candidate => {
          const page = await client.searchPage(mediaType, candidate, 1);
          rememberPage(client.id, candidate, page);
          return page.results;
        },
      };
      if (client.searchPages !== undefined) {
        adapter.searchMany = async candidates => {
          const pages = await client.searchPages?.(mediaType, candidates, 1);
          for (const [index, page] of (pages ?? []).entries()) {
            rememberPage(client.id, candidates[index], page);
          }
          return (pages ?? []).map(page => page.results);
        };
      }
      return adapter;
    });
    if (!providers.length) {
      this.sessions.delete(sessionKey);
      return { results: [], warnings: [searchFeatureText("provider.noneEnabled")], hasMore: false };
    }

    const response = await searchMultilingualProviders({
      query,
      providers,
      languages: this.languages(),
      dedupe: dedupeSearchResults,
      maxResults: MAX_RESULTS,
      onProgress,
    });
    const session = new SearchSession(mediaType, query, response.expandedQueries, response.results, [...cursors.values()]);
    this.sessions.delete(sessionKey);
    this.sessions.set(sessionKey, session);
    while (this.sessions.size > MAX_CACHED_SESSIONS) {
      const oldest = this.sessions.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }
    const results = session.takePage();
    return { results, warnings: response.warnings, hasMore: session.hasMore };
  }

  /**
   * Use the original multilingual query plan for further pages. A standalone
   * page request (without a search session) preserves the legacy host API.
   */
  async searchPage(mediaType: MediaType, query: string, page: number): Promise<ExternalMediaSearchPage> {
    const providers = this.enabledProviders(mediaType);
    if (!providers.length) {
      return { results: [], warnings: [searchFeatureText("provider.noneEnabled")], hasMore: false };
    }
    const session = this.sessions.get(this.sessionKey(mediaType, query));
    if (session && page === session.nextPage) {
      const warnings: string[] = [];
      let attempts = 0;
      while (session.pendingCount < PAGE_RESULT_LIMIT && session.hasMore && attempts < MAX_CURSOR_REQUESTS_PER_PAGE) {
        const cursor = session.nextCursor();
        if (!cursor) break;
        attempts += 1;
        try {
          const response = await this.clients[cursor.provider].searchPage(mediaType, cursor.query, cursor.nextPage);
          session.addCandidates(response.results);
          session.advanceCursor(cursor, response);
        } catch (error: unknown) {
          warnings.push(`${this.clients[cursor.provider].label}: ${errorMessage(error)}`);
          session.discardProvider(cursor.provider);
        }
      }
      const results = session.takePage();
      session.nextPage += 1;
      return { results, warnings: [...new Set(warnings)], hasMore: session.hasMore };
    }

    const settled = await Promise.all(
      providers.map(client => providerTask(client.label, client.searchPage(mediaType, query, page))),
    );
    const warnings = settled
      .filter(entry => entry.error !== undefined)
      .map(entry => `${entry.provider}: ${errorMessage(entry.error)}`);
    const merged = dedupeSearchResults(settled.flatMap(entry => entry.page?.results ?? []));
    return {
      results: rankSearchResults(merged, query).slice(0, PAGE_RESULT_LIMIT),
      warnings,
      hasMore: settled.some(entry => entry.page?.hasMore === true),
    };
  }

  async searchProvider(
    provider: MetadataProviderId,
    mediaType: MediaType,
    query: string,
  ): Promise<ExternalMediaResult[]> {
    const client = this.clients[provider];
    if (!client.supports(mediaType)) return [];
    return (await client.searchPage(mediaType, query, 1)).results;
  }
}
