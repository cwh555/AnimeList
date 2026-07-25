import type { Plugin } from "obsidian";
import {
  DEFAULT_SEARCH_LANGUAGES,
  searchMultilingualProviders,
  type SearchProviderAdapter,
} from "./multilingual-search";
import { preferAniListSearchResults } from "./classification-search";
import { searchAniListCanonical } from "./anilist-search";
import { legacyTest } from "./legacy";
import type { AnimeListSettings, ExternalMediaResult, MediaType } from "./types";

const PATCH_MARKER = Symbol.for("animelist.classification-search-runtime");

interface ClassificationSearchRuntime extends Plugin {
  settings: AnimeListSettings;
  openAddModal(initialType?: MediaType): void;
  searchExternal(mediaType: MediaType, query: string): Promise<{ results: ExternalMediaResult[]; warnings: string[] }>;
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  searchBangumi(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  searchOpenLibrary(query: string): Promise<ExternalMediaResult[]>;
}

function providersFor(plugin: ClassificationSearchRuntime, mediaType: MediaType): SearchProviderAdapter[] {
  const providers: SearchProviderAdapter[] = [];
  if (plugin.settings.providers.anilist) {
    providers.push({
      label: "AniList",
      // Limit AniList to one request per search phase, but allow the alias phase.
      // This is required when a Chinese Bangumi result supplies a Japanese or
      // English title that AniList can resolve canonically.
      singleQueryOnly: true,
      search: (query) => plugin.searchAniList(mediaType, query),
    });
  }
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

function installCanonicalSearch(plugin: ClassificationSearchRuntime): void {
  plugin.searchExternal = async (mediaType, query) => {
    const response = await searchMultilingualProviders({
      query,
      providers: providersFor(plugin, mediaType),
      languages: plugin.settings.searchLanguages ?? DEFAULT_SEARCH_LANGUAGES,
      dedupe: preferAniListSearchResults,
      maxResults: 24,
    });
    return { results: preferAniListSearchResults(response.results), warnings: response.warnings };
  };
}

export function installClassificationSearchRuntime(plugin: Plugin): void {
  const runtime = plugin as ClassificationSearchRuntime;
  if (Reflect.get(runtime, PATCH_MARKER) === true) return;
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Runtime method binding crosses the Obsidian plugin boundary. */
  const normalizeAniListMedia = legacyTest.normalizeAniListMedia as unknown as (
    value: unknown,
    mediaType: MediaType,
  ) => ExternalMediaResult;
  runtime.searchAniList = (mediaType, query) => searchAniListCanonical(mediaType, query, normalizeAniListMedia);
  const originalOpenAddModal = runtime.openAddModal.bind(runtime);
  runtime.openAddModal = (initialType = "anime") => {
    installCanonicalSearch(runtime);
    originalOpenAddModal(initialType);
  };
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Restore strict checks after runtime method binding. */
  Object.defineProperty(runtime, PATCH_MARKER, { value: true });
}
