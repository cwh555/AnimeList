import type { Plugin } from "obsidian";
import {
  DEFAULT_SEARCH_LANGUAGES,
  searchMultilingualProviders,
  type SearchProviderAdapter,
} from "./multilingual-search";
import { preferAniListSearchResults } from "./classification-search";
import { searchAniListCanonical } from "./anilist-search";
import type { AnimeListSettings, ExternalMediaResult, MediaType } from "./types";

const PATCH_MARKER = Symbol.for("animelist.classification-search-runtime");
const CANONICAL_WARNING = "AniList could not provide a canonical result with classifications.";

interface ClassificationSearchRuntime extends Plugin {
  settings: AnimeListSettings;
  searchExternal(mediaType: MediaType, query: string): Promise<{ results: ExternalMediaResult[]; warnings: string[] }>;
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  searchBangumi(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  searchOpenLibrary(query: string): Promise<ExternalMediaResult[]>;
}

function providersFor(plugin: ClassificationSearchRuntime, mediaType: MediaType): SearchProviderAdapter[] {
  const providers: SearchProviderAdapter[] = [{
    label: "AniList",
    singleQueryOnly: true,
    search: (query) => plugin.searchAniList(mediaType, query),
  }];
  if (plugin.settings.providers.bangumi) {
    providers.push({
      label: "Bangumi",
      supportsChineseDiscovery: true,
      search: (query) => plugin.searchBangumi(mediaType, query),
    });
  }
  if (mediaType === "novel" && plugin.settings.providers.openlibrary) {
    providers.push({ label: "Open Library", search: (query) => plugin.searchOpenLibrary(query) });
  }
  return providers;
}

export function selectableAniListResults(results: readonly ExternalMediaResult[]): ExternalMediaResult[] {
  return preferAniListSearchResults(results)
    .filter((result) => result.provider.toLocaleLowerCase() === "anilist")
    .filter((result) => result.genres.length > 0);
}

function installCanonicalSearch(plugin: ClassificationSearchRuntime): void {
  plugin.searchExternal = async (mediaType, query) => {
    const response = await searchMultilingualProviders({
      query,
      providers: providersFor(plugin, mediaType),
      languages: plugin.settings.searchLanguages ?? DEFAULT_SEARCH_LANGUAGES,
      dedupe: preferAniListSearchResults,
      maxResults: 24,
    });
    const results = selectableAniListResults(response.results);
    const warnings = results.length
      ? response.warnings
      : [...new Set([...response.warnings, CANONICAL_WARNING])];
    return { results, warnings };
  };
}

export function installClassificationSearchRuntime(plugin: Plugin): void {
  const runtime = plugin as ClassificationSearchRuntime;
  if (Reflect.get(runtime, PATCH_MARKER) === true) return;
  runtime.searchAniList = (mediaType, query) => searchAniListCanonical(mediaType, query);
  installCanonicalSearch(runtime);
  Object.defineProperty(runtime, PATCH_MARKER, { value: true });
}
