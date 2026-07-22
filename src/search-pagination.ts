import { requestUrl } from "obsidian";
import LegacyAnimeListPlugin, { legacyTest } from "./legacy";
import { rankSearchResults } from "./search";
import type { ExternalMediaResult, MediaType, ProviderSettings } from "./types";

export const SEARCH_PAGINATION_LIMITS = {
  pageSize: 24,
  maxLoads: 2,
  maxResults: 72,
} as const;

const LOAD_MORE_LABEL = "載入更多";
const LOADING_MORE_LABEL = "載入中…";
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function resultKey(result: ExternalMediaResult): string {
  return `${result.provider}:${result.sourceId}`;
}

export function mergeSearchPages(
  initial: ExternalMediaResult[],
  pages: ExternalMediaResult[][],
): ExternalMediaResult[] {
  const deduped = legacyTest.dedupeSearchResults([initial, ...pages].flat()) as ExternalMediaResult[];
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
    items: subjects.map((subject) => (
      legacyTest.normalizeBangumiSubject(subject, mediaType) as ExternalMediaResult
    )),
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
    media = media.filter((item) => String(asRecord(item).format ?? "").toUpperCase() !== "NOVEL");
  }
  return {
    items: media.map((item) => (
      legacyTest.normalizeAniListMedia(item, mediaType) as ExternalMediaResult
    )),
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
    items: docs.map((book) => (
      legacyTest.normalizeOpenLibraryBook(book) as ExternalMediaResult
    )),
    hasMore: total === null ? docs.length === limit : start + docs.length < total,
  };
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
  const tasks: Array<Promise<{ provider: string; page?: ProviderPage; error?: unknown }>> = [];

  if (providers.bangumi) {
    tasks.push(searchBangumiPage(mediaType, query, page)
      .then((providerPage) => ({ provider: "Bangumi", page: providerPage }))
      .catch((error) => ({ provider: "Bangumi", error })));
  }
  if (providers.anilist) {
    tasks.push(searchAniListPage(mediaType, query, page)
      .then((providerPage) => ({ provider: "AniList", page: providerPage }))
      .catch((error) => ({ provider: "AniList", error })));
  }
  if (mediaType === "novel" && providers.openlibrary) {
    tasks.push(searchOpenLibraryPage(query, page)
      .then((providerPage) => ({ provider: "Open Library", page: providerPage }))
      .catch((error) => ({ provider: "Open Library", error })));
  }

  const settled = await Promise.all(tasks);
  const warnings = settled
    .filter((entry) => entry.error !== undefined)
    .map((entry) => `${entry.provider}: ${errorMessage(entry.error)}`);
  const merged = legacyTest.dedupeSearchResults(
    settled.flatMap((entry) => entry.page?.items ?? []),
  ) as ExternalMediaResult[];
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
  const context = currentSearchContext(state.modalEl);
  const canLoadMore = context !== null
    && resultCount > 0
    && !state.loading
    && !state.exhausted
    && state.requestedLoads < SEARCH_PAGINATION_LIMITS.maxLoads
    && resultCount < SEARCH_PAGINATION_LIMITS.maxResults;
  if (!canLoadMore) return;

  const actions = document.createElement("div");
  actions.className = "al-modal-actions al-search-pagination";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "al-secondary-button";
  button.textContent = LOAD_MORE_LABEL;
  button.addEventListener("click", () => {
    const searchButton = state.modalEl.querySelector<HTMLButtonElement>(".al-modal-search-row button");
    if (!searchButton) return;
    state.requestedLoads += 1;
    state.loadMoreRequested = true;
    state.loading = true;
    state.restoreScrollTop = state.modalEl.scrollTop;
    button.disabled = true;
    button.textContent = LOADING_MORE_LABEL;
    searchButton.click();
  });
  actions.appendChild(button);
  state.modalEl.querySelector(".al-search-results")?.insertAdjacentElement("afterend", actions);
}

function installPagination(plugin: PaginationPlugin, modalEl: HTMLElement): void {
  const originalSearch = plugin.searchExternal.bind(plugin);
  const observer = new MutationObserver(() => {
    window.queueMicrotask(() => enhanceModal(plugin, state));
  });
  const state: PaginationState = {
    modalEl,
    observer,
    originalSearch,
    wrappedSearch: async () => ({ results: [], warnings: [] }),
    signature: "",
    requestedLoads: 0,
    initial: null,
    pages: new Map(),
    exhausted: false,
    loading: false,
    restoreScrollTop: null,
    loadMoreRequested: false,
  };

  state.wrappedSearch = async (mediaType, query) => {
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

  plugin.searchExternal = state.wrappedSearch;
  observer.observe(modalEl.parentElement ?? document.body, { childList: true, subtree: true });
  enhanceModal(plugin, state);
}

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
