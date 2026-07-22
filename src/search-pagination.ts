import { requestUrl } from "obsidian";
import LegacyAnimeListPlugin, { legacyTest } from "./legacy";
import { rankSearchResults } from "./search";
import { uiText } from "./ui-text";
import type { ExternalMediaResult, MediaType, ProviderSettings } from "./types";

export const SEARCH_PAGINATION_LIMITS = {
  pageSize: 24,
  maxLoads: 2,
  maxResults: 72,
} as const;

const MEDIA_TYPES: MediaType[] = ["anime", "manga", "novel"];
const USER_AGENT = "AnimeList-Obsidian (local personal media library)";

interface SearchResponse {
  results: ExternalMediaResult[];
  warnings: string[];
}

interface SearchPage extends SearchResponse {
  hasMore: boolean;
}

interface ProviderPage {
  items: ExternalMediaResult[];
  hasMore: boolean;
}

interface ProviderOutcome {
  provider: string;
  page?: ProviderPage;
  error?: unknown;
}

interface PaginationPlugin extends LegacyAnimeListPlugin {
  settings?: {
    providers?: ProviderSettings;
  };
  searchExternal(mediaType: MediaType, query: string): Promise<SearchResponse>;
}

interface PaginationState {
  modalEl: HTMLElement;
  observer: MutationObserver;
  originalSearch: (mediaType: MediaType, query: string) => Promise<SearchResponse>;
  wrappedSearch: (mediaType: MediaType, query: string) => Promise<SearchResponse>;
  signature: string;
  requestedLoads: number;
  initial: SearchResponse | null;
  pages: Map<number, SearchPage>;
  exhausted: boolean;
  loading: boolean;
  restoreScrollTop: number | null;
  loadMoreRequested: boolean;
}

const normalizeBangumiSubject = legacyTest.normalizeBangumiSubject as (
  subject: unknown,
  mediaType: MediaType,
) => ExternalMediaResult;
const normalizeAniListMedia = legacyTest.normalizeAniListMedia as (
  media: unknown,
  mediaType: MediaType,
) => ExternalMediaResult;
const normalizeOpenLibraryBook = legacyTest.normalizeOpenLibraryBook as (
  book: unknown,
) => ExternalMediaResult;
const dedupeSearchResults = legacyTest.dedupeSearchResults as (
  results: ExternalMediaResult[],
) => ExternalMediaResult[];

function isExternalMediaResult(value: unknown): value is ExternalMediaResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<ExternalMediaResult>;
  return typeof result.provider === "string"
    && typeof result.sourceId === "string"
    && typeof result.title === "string";
}

function isSearchResponse(value: unknown): value is SearchResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Partial<SearchResponse>;
  return Array.isArray(response.results)
    && response.results.every(isExternalMediaResult)
    && Array.isArray(response.warnings)
    && response.warnings.every((warning) => typeof warning === "string");
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    const serialized = JSON.stringify(value);
    return serialized || "Unknown error";
  } catch {
    return "Unknown error";
  }
}

function resultKey(result: ExternalMediaResult): string {
  return `${result.provider}:${result.sourceId}`;
}

export function mergeSearchPages(
  initial: ExternalMediaResult[],
  pages: ExternalMediaResult[][],
): ExternalMediaResult[] {
  const deduped = dedupeSearchResults([initial, ...pages].flat());
  const seen = new Set<string>();
  const output: ExternalMediaResult[] = [];
  for (const result of deduped) {
    const key = resultKey(result);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(result);
    if (output.length >= SEARCH_PAGINATION_LIMITS.maxResults) break;
  }
  return output;
}

function currentSearchContext(modalEl: HTMLElement): { mediaType: MediaType; query: string } | null {
  const input = modalEl.querySelector<HTMLInputElement>(".al-modal-search-row input");
  const typeButtons = Array.from(modalEl.querySelectorAll<HTMLButtonElement>(".al-modal-type"));
  const activeIndex = typeButtons.findIndex((button) => button.classList.contains("is-active"));
  const mediaType = MEDIA_TYPES[activeIndex];
  const query = input?.value.trim() ?? "";
  return mediaType && query ? { mediaType, query } : null;
}

function resetState(state: PaginationState, signature: string): void {
  state.signature = signature;
  state.requestedLoads = 0;
  state.initial = null;
  state.pages.clear();
  state.exhausted = false;
  state.loading = false;
  state.restoreScrollTop = null;
  state.loadMoreRequested = false;
}

async function searchBangumiPage(
  mediaType: MediaType,
  query: string,
  page: number,
): Promise<ProviderPage> {
  const limit = 20;
  const offset = (page - 1) * limit;
  const response = await requestUrl({
    url: `https://api.bgm.tv/v0/search/subjects?limit=${limit}&offset=${offset}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      keyword: query,
      sort: "match",
      filter: { type: [mediaType === "anime" ? 2 : 1], nsfw: false },
    }),
  });
  const payload = asRecord(response.json ?? JSON.parse(response.text || "{}"));
  const subjects = asArray(payload.data);
  const total = numberValue(payload.total);
  return {
    items: subjects.map((subject) => normalizeBangumiSubject(subject, mediaType)),
    hasMore: total === null ? subjects.length === limit : offset + subjects.length < total,
  };
}

async function searchAniListPage(
  mediaType: MediaType,
  query: string,
  page: number,
): Promise<ProviderPage> {
  const graphQuery = `
    query ($search: String, $type: MediaType, $format: MediaFormat, $page: Int) {
      Page(page: $page, perPage: 20) {
        pageInfo { hasNextPage }
        media(search: $search, type: $type, format: $format, sort: SEARCH_MATCH) {
          id siteUrl type format status episodes chapters volumes averageScore description(asHtml: false) genres synonyms
          startDate { year month day }
          title { romaji english native }
          coverImage { extraLarge large medium }
          studios(isMain: true) { nodes { name } }
          staff(perPage: 10, sort: RELEVANCE) { edges { role node { name { full native } } } }
        }
      }
    }`;
  const response = await requestUrl({
    url: "https://graphql.anilist.co",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      query: graphQuery,
      variables: {
        search: query,
        type: mediaType === "anime" ? "ANIME" : "MANGA",
        format: mediaType === "novel" ? "NOVEL" : null,
        page,
      },
    }),
  });
  const payload = asRecord(response.json ?? JSON.parse(response.text || "{}"));
  const pagePayload = asRecord(asRecord(payload.data).Page);
  let media = asArray(pagePayload.media);
  if (mediaType === "manga") {
    media = media.filter((item) => stringValue(asRecord(item).format).toUpperCase() !== "NOVEL");
  }
  return {
    items: media.map((item) => normalizeAniListMedia(item, mediaType)),
    hasMore: asRecord(pagePayload.pageInfo).hasNextPage === true,
  };
}

async function searchOpenLibraryPage(query: string, page: number): Promise<ProviderPage> {
  const limit = 8;
  const fields = "key,title,author_name,first_publish_year,cover_i,subject";
  const response = await requestUrl({
    url: `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&limit=${limit}&page=${page}&lang=zh`,
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  const payload = asRecord(response.json ?? JSON.parse(response.text || "{}"));
  const docs = asArray(payload.docs);
  const total = numberValue(payload.numFound);
  const start = numberValue(payload.start) ?? (page - 1) * limit;
  return {
    items: docs.map((book) => normalizeOpenLibraryBook(book)),
    hasMore: total === null ? docs.length === limit : start + docs.length < total,
  };
}

function providerTask(provider: string, task: Promise<ProviderPage>): Promise<ProviderOutcome> {
  return task
    .then((page): ProviderOutcome => ({ provider, page }))
    .catch((error: unknown): ProviderOutcome => ({ provider, error }));
}

async function searchExternalPage(
  plugin: PaginationPlugin,
  mediaType: MediaType,
  query: string,
  page: number,
): Promise<SearchPage> {
  const providers = plugin.settings?.providers ?? {
    bangumi: true,
    anilist: true,
    openlibrary: true,
  };
  const tasks: Array<Promise<ProviderOutcome>> = [];

  if (providers.bangumi) tasks.push(providerTask("Bangumi", searchBangumiPage(mediaType, query, page)));
  if (providers.anilist) tasks.push(providerTask("AniList", searchAniListPage(mediaType, query, page)));
  if (mediaType === "novel" && providers.openlibrary) {
    tasks.push(providerTask("Open Library", searchOpenLibraryPage(query, page)));
  }

  const settled = await Promise.all(tasks);
  const warnings = settled
    .filter((entry) => entry.error !== undefined)
    .map((entry) => `${entry.provider}: ${errorMessage(entry.error)}`);
  const merged = dedupeSearchResults(settled.flatMap((entry) => entry.page?.items ?? []));
  return {
    results: rankSearchResults(merged, query).slice(0, SEARCH_PAGINATION_LIMITS.pageSize),
    warnings,
    hasMore: settled.some((entry) => entry.page?.hasMore === true),
  };
}

function cleanup(plugin: PaginationPlugin, state: PaginationState): void {
  state.observer.disconnect();
  if (plugin.searchExternal === state.wrappedSearch) plugin.searchExternal = state.originalSearch;
}

function enhanceModal(plugin: PaginationPlugin, state: PaginationState): void {
  if (!state.modalEl.isConnected) {
    cleanup(plugin, state);
    return;
  }
  if (state.restoreScrollTop !== null) {
    state.modalEl.scrollTop = state.restoreScrollTop;
    state.restoreScrollTop = null;
  }
  state.modalEl.querySelector(".al-search-pagination")?.remove();
  const resultCount = state.modalEl.querySelectorAll(".al-search-result").length;
  const canLoadMore = currentSearchContext(state.modalEl) !== null
    && resultCount > 0
    && !state.loading
    && !state.exhausted
    && state.requestedLoads < SEARCH_PAGINATION_LIMITS.maxLoads
    && resultCount < SEARCH_PAGINATION_LIMITS.maxResults;
  if (!canLoadMore) return;

  const actions = state.modalEl.createDiv({ cls: "al-modal-actions al-search-pagination" });
  const button = actions.createEl("button", { text: uiText("add.loadMore"), cls: "al-secondary-button" });
  button.type = "button";
  button.addEventListener("click", () => {
    const searchButton = state.modalEl.querySelector<HTMLButtonElement>(".al-modal-search-row button");
    if (!searchButton) return;
    state.requestedLoads += 1;
    state.loadMoreRequested = true;
    state.loading = true;
    state.restoreScrollTop = state.modalEl.scrollTop;
    button.disabled = true;
    button.textContent = uiText("add.loadingMore");
    searchButton.click();
  });
  state.modalEl.querySelector(".al-search-results")?.insertAdjacentElement("afterend", actions);
}

function installPagination(plugin: PaginationPlugin, modalEl: HTMLElement): void {
  const searchExternalValue: unknown = Reflect.get(plugin, "searchExternal");
  if (typeof searchExternalValue !== "function") {
    throw new TypeError("AnimeList searchExternal is unavailable");
  }
  const originalSearch = async (mediaType: MediaType, query: string): Promise<SearchResponse> => {
    const response: unknown = await Reflect.apply(searchExternalValue, plugin, [mediaType, query]);
    if (!isSearchResponse(response)) {
      throw new TypeError("AnimeList searchExternal returned an invalid response");
    }
    return response;
  };
  let state: PaginationState;
  const observer = new MutationObserver(() => {
    window.queueMicrotask(() => enhanceModal(plugin, state));
  });
  const wrappedSearch = async (mediaType: MediaType, query: string): Promise<SearchResponse> => {
    const signature = `${mediaType}\u0000${query.trim()}`;
    const isLoadMore = state.loadMoreRequested;
    state.loadMoreRequested = false;
    if (state.signature !== signature || !isLoadMore) resetState(state, signature);
    state.loading = true;
    try {
      if (!state.initial) state.initial = await originalSearch(mediaType, query);
      for (let page = 2; page <= state.requestedLoads + 1; page += 1) {
        if (!state.pages.has(page)) {
          state.pages.set(page, await searchExternalPage(plugin, mediaType, query, page));
        }
      }
      const orderedPages = Array.from(state.pages.entries())
        .sort(([left], [right]) => left - right)
        .map(([, value]) => value);
      const results = mergeSearchPages(
        state.initial.results,
        orderedPages.map((page) => page.results),
      );
      const warnings = Array.from(new Set([
        ...state.initial.warnings,
        ...orderedPages.flatMap((page) => page.warnings),
      ]));
      const previousResults = orderedPages.length > 0
        ? mergeSearchPages(
          state.initial.results,
          orderedPages.slice(0, -1).map((page) => page.results),
        )
        : [];
      const lastPage = orderedPages[orderedPages.length - 1];
      state.exhausted = results.length === 0
        || results.length >= SEARCH_PAGINATION_LIMITS.maxResults
        || state.requestedLoads >= SEARCH_PAGINATION_LIMITS.maxLoads
        || (orderedPages.length > 0 && results.length === previousResults.length)
        || (lastPage !== undefined && !lastPage.hasMore);
      return { results, warnings };
    } finally {
      state.loading = false;
    }
  };

  state = {
    modalEl,
    observer,
    originalSearch,
    wrappedSearch,
    signature: "",
    requestedLoads: 0,
    initial: null,
    pages: new Map<number, SearchPage>(),
    exhausted: false,
    loading: false,
    restoreScrollTop: null,
    loadMoreRequested: false,
  };
  plugin.searchExternal = wrappedSearch;
  observer.observe(modalEl.parentElement ?? document.body, { childList: true, subtree: true });
  enhanceModal(plugin, state);
}

// The legacy modal is still the runtime modal used by the typed plugin.
// eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve the original prototype method before wrapping it.
const originalOpenAddModal = LegacyAnimeListPlugin.prototype.openAddModal;
LegacyAnimeListPlugin.prototype.openAddModal = function openAddModalWithPagination(
  this: PaginationPlugin,
  initialType = "anime",
): void {
  originalOpenAddModal.call(this, initialType);
  window.queueMicrotask(() => {
    const modals = Array.from(document.querySelectorAll<HTMLElement>(".animelist-modal"));
    const modalEl = modals[modals.length - 1];
    if (modalEl) installPagination(this, modalEl);
  });
};
