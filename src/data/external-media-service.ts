import type { ProviderSettings, SearchLanguageSettings } from "../domain/settings-types";
import type { ExternalMediaResult, ExternalMediaSearchPage, MediaType } from "../domain/media-types";
import { searchMultilingualProviders, type SearchProviderAdapter } from "../multilingual-search";
import { rankSearchResults } from "../search";
import { searchFeatureText } from "../search-feature-text";
import {
  enabledMetadataProviders,
  type MetadataProviderClients,
  type MetadataProviderId,
  type MetadataProviderPage,
} from "./external-media-provider";
import { dedupeSearchResults } from "./provider-normalizers";

const PAGE_RESULT_LIMIT = 24;

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

  async search(mediaType: MediaType, query: string): Promise<{
    results: ExternalMediaResult[];
    warnings: string[];
  }> {
    const providers: SearchProviderAdapter[] = this.enabledProviders(mediaType).map((client) => {
      const provider: SearchProviderAdapter = {
        label: client.label,
        supportsChineseDiscovery: client.supportsChineseDiscovery,
        search: async (candidate) => (await client.searchPage(mediaType, candidate, 1)).results,
      };
      if (client.searchPages !== undefined) {
        provider.searchMany = async (candidates) => {
          const pages = await client.searchPages?.(mediaType, candidates, 1);
          return (pages ?? []).map((page) => page.results);
        };
      }
      return provider;
    });
    if (!providers.length) {
      return { results: [], warnings: [searchFeatureText("provider.noneEnabled")] };
    }

    const response = await searchMultilingualProviders({
      query,
      providers,
      languages: this.languages(),
      dedupe: dedupeSearchResults,
      maxResults: PAGE_RESULT_LIMIT,
    });
    return { results: response.results, warnings: response.warnings };
  }

  async searchPage(mediaType: MediaType, query: string, page: number): Promise<ExternalMediaSearchPage> {
    const providers = this.enabledProviders(mediaType);
    if (!providers.length) {
      return {
        results: [],
        warnings: [searchFeatureText("provider.noneEnabled")],
        hasMore: false,
      };
    }

    const settled = await Promise.all(
      providers.map((client) => providerTask(client.label, client.searchPage(mediaType, query, page))),
    );
    const warnings = settled
      .filter((entry) => entry.error !== undefined)
      .map((entry) => `${entry.provider}: ${errorMessage(entry.error)}`);
    const merged = dedupeSearchResults(settled.flatMap((entry) => entry.page?.results ?? []));
    return {
      results: rankSearchResults(merged, query).slice(0, PAGE_RESULT_LIMIT),
      warnings,
      hasMore: settled.some((entry) => entry.page?.hasMore === true),
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
