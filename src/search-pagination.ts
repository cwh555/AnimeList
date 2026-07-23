/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return -- Runtime compatibility adapter for the legacy modal. */
// @ts-nocheck
import { requestUrl } from "obsidian";
import LegacyAnimeListPlugin, { legacyTest } from "./legacy";
import { rankSearchResults } from "./search";
import { uiText } from "./ui-text";

export const SEARCH_PAGINATION_LIMITS = {
  pageSize: 24,
  maxLoads: 2,
  maxResults: 72,
};

const MEDIA_TYPES = ["anime", "manga", "novel"];
const USER_AGENT = "AnimeList-Obsidian (local personal media library)";
const PATCH_MARKER = Symbol.for("animelist.search-pagination.installed");
const { normalizeBangumiSubject, normalizeAniListMedia, normalizeOpenLibraryBook, dedupeSearchResults } = legacyTest;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function errorMessage(value) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) || "Unknown error";
  } catch {
    return "Unknown error";
  }
}

function resultKey(result) {
  return `${result.provider}:${result.sourceId}`;
}

export function mergeSearchPages(initial, pages) {
  const deduped = dedupeSearchResults([initial, ...pages].flat());
  const seen = new Set();
  const output = [];
  for (const result of deduped) {
    const key = resultKey(result);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(result);
    if (output.length >= SEARCH_PAGINATION_LIMITS.maxResults) break;
  }
  return output;
}

export function searchScrollContainer(modalEl) {
  return modalEl.querySelector?.(".modal-content") ?? modalEl;
}

export function captureSearchScroll(modalEl) {
  const container = searchScrollContainer(modalEl);
  return { container, scrollTop: container.scrollTop };
}

export function restoreSearchScroll(snapshot) {
  if (snapshot?.container?.isConnected !== false) snapshot.container.scrollTop = snapshot.scrollTop;
}

function currentSearchContext(modalEl) {
  const input = modalEl.querySelector(".al-modal-search-row input");
  const buttons = [...modalEl.querySelectorAll(".al-modal-type")];
  const mediaType = MEDIA_TYPES[buttons.findIndex((button) => button.classList.contains("is-active"))];
  const query = input?.value.trim() || "";
  return mediaType && query ? { mediaType, query } : null;
}

function resetState(state, signature) {
  state.signature = signature;
  state.requestedLoads = 0;
  state.initial = null;
  state.pages.clear();
  state.exhausted = false;
  state.loading = false;
  state.restoreScroll = null;
  state.restoreScheduled = false;
  state.loadMoreRequested = false;
}

async function searchBangumiPage(mediaType, query, page) {
  const limit = 20;
  const offset = (page - 1) * limit;
  const response = await requestUrl({
    url: `https://api.bgm.tv/v0/search/subjects?limit=${limit}&offset=${offset}`,
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ keyword: query, sort: "match", filter: { type: [mediaType === "anime" ? 2 : 1], nsfw: false } }),
  });
  const payload = asRecord(response.json || JSON.parse(response.text || "{}"));
  const subjects = asArray(payload.data);
  const total = numberValue(payload.total);
  return {
    items: subjects.map((subject) => normalizeBangumiSubject(subject, mediaType)),
    hasMore: total === null ? subjects.length === limit : offset + subjects.length < total,
  };
}

async function searchAniListPage(mediaType, query, page) {
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
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({
      query: graphQuery,
      variables: { search: query, type: mediaType === "anime" ? "ANIME" : "MANGA", format: mediaType === "novel" ? "NOVEL" : null, page },
    }),
  });
  const payload = asRecord(response.json || JSON.parse(response.text || "{}"));
  const pagePayload = asRecord(asRecord(payload.data).Page);
  let media = asArray(pagePayload.media);
  if (mediaType === "manga") media = media.filter((item) => String(asRecord(item).format || "").toUpperCase() !== "NOVEL");
  return {
    items: media.map((item) => normalizeAniListMedia(item, mediaType)),
    hasMore: asRecord(pagePayload.pageInfo).hasNextPage === true,
  };
}

async function searchOpenLibraryPage(query, page) {
  const limit = 8;
  const fields = "key,title,author_name,first_publish_year,cover_i,subject";
  const response = await requestUrl({
    url: `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&limit=${limit}&page=${page}&lang=zh`,
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  const payload = asRecord(response.json || JSON.parse(response.text || "{}"));
  const docs = asArray(payload.docs);
  const total = numberValue(payload.numFound);
  const start = numberValue(payload.start) ?? (page - 1) * limit;
  return {
    items: docs.map(normalizeOpenLibraryBook),
    hasMore: total === null ? docs.length === limit : start + docs.length < total,
  };
}

function providerTask(provider, task) {
  return task.then((page) => ({ provider, page })).catch((error) => ({ provider, error }));
}

async function searchExternalPage(plugin, mediaType, query, page) {
  const providers = plugin.settings?.providers || { bangumi: true, anilist: true, openlibrary: true };
  const tasks = [];
  if (providers.bangumi) tasks.push(providerTask("Bangumi", searchBangumiPage(mediaType, query, page)));
  if (providers.anilist) tasks.push(providerTask("AniList", searchAniListPage(mediaType, query, page)));
  if (mediaType === "novel" && providers.openlibrary) tasks.push(providerTask("Open Library", searchOpenLibraryPage(query, page)));
  const settled = await Promise.all(tasks);
  const warnings = settled.filter((entry) => entry.error !== undefined).map((entry) => `${entry.provider}: ${errorMessage(entry.error)}`);
  const merged = dedupeSearchResults(settled.flatMap((entry) => entry.page?.items || []));
  return {
    results: rankSearchResults(merged, query).slice(0, SEARCH_PAGINATION_LIMITS.pageSize),
    warnings,
    hasMore: settled.some((entry) => entry.page?.hasMore === true),
  };
}

function cleanup(plugin, state) {
  state.observer.disconnect();
  if (plugin.searchExternal === state.wrappedSearch) plugin.searchExternal = state.originalSearch;
}

function queueEnhance(plugin, state) {
  if (state.enhanceQueued) return;
  state.enhanceQueued = true;
  window.queueMicrotask(() => {
    state.enhanceQueued = false;
    enhanceModal(plugin, state);
  });
}

function scheduleScrollRestore(state) {
  if (state.restoreScroll === null || state.restoreScheduled) return;
  state.restoreScheduled = true;
  const snapshot = state.restoreScroll;
  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      state.restoreScheduled = false;
      state.restoreScroll = null;
      restoreSearchScroll(snapshot);
    });
  }, 0);
}

function enhanceModal(plugin, state) {
  if (!state.modalEl.isConnected) {
    cleanup(plugin, state);
    return;
  }
  scheduleScrollRestore(state);

  const existing = state.modalEl.querySelector(".al-search-pagination");
  const resultCount = state.modalEl.querySelectorAll(".al-search-result").length;
  const canLoadMore = currentSearchContext(state.modalEl)
    && resultCount > 0
    && !state.loading
    && !state.exhausted
    && state.requestedLoads < SEARCH_PAGINATION_LIMITS.maxLoads
    && resultCount < SEARCH_PAGINATION_LIMITS.maxResults;

  if (!canLoadMore) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const actions = state.modalEl.createDiv({ cls: "al-modal-actions al-search-pagination" });
  const button = actions.createEl("button", { text: uiText("add.loadMore"), cls: "al-secondary-button" });
  button.type = "button";
  button.addEventListener("click", () => {
    const searchButton = state.modalEl.querySelector(".al-modal-search-row button");
    if (!searchButton || state.loading) return;
    state.requestedLoads += 1;
    state.loadMoreRequested = true;
    state.loading = true;
    state.restoreScroll = captureSearchScroll(state.modalEl);
    button.disabled = true;
    button.textContent = uiText("add.loadingMore");
    searchButton.click();
  });
  state.modalEl.querySelector(".al-search-results")?.insertAdjacentElement("afterend", actions);
}

function installPagination(plugin, modalEl) {
  const searchExternalValue = plugin.searchExternal;
  if (typeof searchExternalValue !== "function") return;
  const originalSearch = async (mediaType, query) => searchExternalValue.call(plugin, mediaType, query);
  let state;
  const observer = new MutationObserver(() => queueEnhance(plugin, state));
  const wrappedSearch = async (mediaType, query) => {
    const signature = `${mediaType}\u0000${query.trim()}`;
    const isLoadMore = state.loadMoreRequested;
    state.loadMoreRequested = false;
    if (state.signature !== signature || !isLoadMore) resetState(state, signature);
    state.loading = true;
    try {
      if (!state.initial) state.initial = await originalSearch(mediaType, query);
      for (let page = 2; page <= state.requestedLoads + 1; page += 1) {
        if (!state.pages.has(page)) state.pages.set(page, await searchExternalPage(plugin, mediaType, query, page));
      }
      const orderedPages = [...state.pages.entries()].sort(([left], [right]) => left - right).map(([, value]) => value);
      const results = mergeSearchPages(state.initial.results, orderedPages.map((entry) => entry.results));
      const warnings = [...new Set([...state.initial.warnings, ...orderedPages.flatMap((entry) => entry.warnings)])];
      const previousCount = orderedPages.length
        ? mergeSearchPages(state.initial.results, orderedPages.slice(0, -1).map((entry) => entry.results)).length
        : 0;
      const lastPage = orderedPages.at(-1);
      state.exhausted = results.length === 0
        || results.length >= SEARCH_PAGINATION_LIMITS.maxResults
        || state.requestedLoads >= SEARCH_PAGINATION_LIMITS.maxLoads
        || (orderedPages.length > 0 && results.length === previousCount)
        || (lastPage && !lastPage.hasMore);
      return { results, warnings };
    } finally {
      state.loading = false;
    }
  };

  state = {
    modalEl, observer, originalSearch, wrappedSearch,
    signature: "", requestedLoads: 0, initial: null, pages: new Map(), exhausted: false,
    loading: false, restoreScroll: null, restoreScheduled: false, loadMoreRequested: false, enhanceQueued: false,
  };
  plugin.searchExternal = wrappedSearch;
  observer.observe(modalEl.parentElement || document.body, { childList: true, subtree: true });
  enhanceModal(plugin, state);
}

const prototype = LegacyAnimeListPlugin.prototype;
if (prototype[PATCH_MARKER] !== true) {
  const originalOpenAddModal = prototype.openAddModal;
  prototype.openAddModal = function openAddModalWithStablePagination(initialType = "anime") {
    originalOpenAddModal.call(this, initialType);
    window.queueMicrotask(() => {
      const modals = [...document.querySelectorAll(".animelist-modal")];
      const modalEl = modals.at(-1);
      if (modalEl) installPagination(this, modalEl);
    });
  };
  Object.defineProperty(prototype, PATCH_MARKER, { value: true });
}

/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return -- End runtime compatibility adapter lint scope. */