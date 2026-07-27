import { Modal, Notice, requestUrl } from "obsidian";
import LegacyAnimeListPlugin from "./legacy";
import { rankSearchResults } from "./search";
import {
  dedupeSearchResults,
  normalizeAniListMedia,
  normalizeBangumiSubject,
  normalizeOpenLibraryBook,
} from "./data/provider-normalizers";
import { uiText } from "./ui-text";
import type { ExternalMediaResult, MediaType, ProviderSettings } from "./types";

export const SEARCH_PAGINATION_LIMITS = {
  pageSize: 24,
  maxLoads: 2,
  maxResults: 72,
} as const;

interface SearchPage {
  results: ExternalMediaResult[];
  warnings: string[];
  hasMore: boolean;
}

interface ProviderPage {
  items: ExternalMediaResult[];
  hasMore: boolean;
}

interface ProviderTaskResult {
  provider: string;
  page?: ProviderPage;
  error?: unknown;
}

interface PaginatedPlugin {
  settings?: { providers?: ProviderSettings };
}

interface AppendTarget<Node> {
  appendChild(node: Node): unknown;
}

interface LegacyAddMediaModal extends Modal {
  plugin: PaginatedPlugin;
  mediaType: MediaType;
  query: string;
  results: ExternalMediaResult[];
  warnings: string[];
  renderSearch: () => void;
  search: (button: HTMLButtonElement) => Promise<void>;
  createResultRow: (result: ExternalMediaResult) => HTMLElement;
}

interface PaginationState {
  signature: string;
  results: ExternalMediaResult[];
  warnings: string[];
  loads: number;
  hasMore: boolean;
  loading: boolean;
  initialSearchPending: boolean;
}

interface LegacyPluginPrototype extends Record<PropertyKey, unknown> {
  openAddModal: (this: LegacyAnimeListPlugin, initialType?: string) => void;
}

const PATCH_MARKER = Symbol.for("animelist.search-pagination.native-append");
const USER_AGENT = "AnimeList-Obsidian (local personal media library)";
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

export function appendSearchResultRows<Node>(
  target: AppendTarget<Node>,
  results: readonly ExternalMediaResult[],
  createRow: (result: ExternalMediaResult) => Node,
): number {
  for (const result of results) target.appendChild(createRow(result));
  return results.length;
}

function searchSignature(mediaType: MediaType, query: string): string {
  return `${mediaType}\u0000${query.trim()}`;
}

function freshState(): PaginationState {
  return {
    signature: "",
    results: [],
    warnings: [],
    loads: 0,
    hasMore: false,
    loading: false,
    initialSearchPending: false,
  };
}

function resetFromInitialSearch(modal: LegacyAddMediaModal, state: PaginationState): void {
  state.signature = searchSignature(modal.mediaType, modal.query);
  state.results = [...modal.results];
  state.warnings = [...modal.warnings];
  state.loads = 0;
  state.hasMore = modal.results.length > 0;
  state.loading = false;
  state.initialSearchPending = false;
}

function canLoadMore(state: PaginationState): boolean {
  return state.hasMore
    && !state.loading
    && state.loads < SEARCH_PAGINATION_LIMITS.maxLoads
    && state.results.length < SEARCH_PAGINATION_LIMITS.maxResults;
}

async function searchBangumiPage(mediaType: MediaType, query: string, page: number): Promise<ProviderPage> {
  const limit = 20;
  const offset = (page - 1) * limit;
  const response = await requestUrl({
    url: `https://api.bgm.tv/v0/search/subjects?limit=${limit}&offset=${offset}`,
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({
      keyword: query,
      sort: "match",
      filter: { type: [mediaType === "anime" ? 2 : 1], nsfw: false },
    }),
  });
  const parsed: unknown = response.json ?? JSON.parse(response.text || "{}");
  const payload = isRecord(parsed) ? parsed : {};
  const subjects = asArray(payload.data);
  const total = numberValue(payload.total);
  return {
    items: subjects.map((subject) => normalizeBangumiSubject(subject, mediaType)),
    hasMore: total === null ? subjects.length === limit : offset + subjects.length < total,
  };
}

async function searchAniListPage(mediaType: MediaType, query: string, page: number): Promise<ProviderPage> {
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
      variables: {
        search: query,
        type: mediaType === "anime" ? "ANIME" : "MANGA",
        format: mediaType === "novel" ? "NOVEL" : null,
        page,
      },
    }),
  });
  const parsed: unknown = response.json ?? JSON.parse(response.text || "{}");
  const payload = isRecord(parsed) ? parsed : {};
  const data = isRecord(payload.data) ? payload.data : {};
  const pagePayload = isRecord(data.Page) ? data.Page : {};
  let media = asArray(pagePayload.media);
  if (mediaType === "manga") {
    media = media.filter((item) => {
      if (!isRecord(item)) return true;
      const format = typeof item.format === "string" ? item.format : "";
      return format.toUpperCase() !== "NOVEL";
    });
  }
  const pageInfo = isRecord(pagePayload.pageInfo) ? pagePayload.pageInfo : {};
  return {
    items: media.map((item) => normalizeAniListMedia(item, mediaType)),
    hasMore: pageInfo.hasNextPage === true,
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
  const parsed: unknown = response.json ?? JSON.parse(response.text || "{}");
  const payload = isRecord(parsed) ? parsed : {};
  const docs = asArray(payload.docs);
  const total = numberValue(payload.numFound);
  const start = numberValue(payload.start) ?? (page - 1) * limit;
  return {
    items: docs.map((item) => normalizeOpenLibraryBook(item)),
    hasMore: total === null ? docs.length === limit : start + docs.length < total,
  };
}

function providerTask(provider: string, task: Promise<ProviderPage>): Promise<ProviderTaskResult> {
  return task.then((page) => ({ provider, page })).catch((error: unknown) => ({ provider, error }));
}

export async function fetchExternalSearchPage(
  plugin: PaginatedPlugin,
  mediaType: MediaType,
  query: string,
  page: number,
): Promise<SearchPage> {
  const providers = plugin.settings?.providers ?? { bangumi: true, anilist: true, openlibrary: true };
  const tasks: Array<Promise<ProviderTaskResult>> = [];
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

export async function appendNextSearchPage(
  modal: LegacyAddMediaModal,
  state: PaginationState,
  resultsEl: HTMLElement,
): Promise<number> {
  if (!canLoadMore(state)) return 0;
  state.loading = true;
  const page = state.loads + 2;
  try {
    const response = await fetchExternalSearchPage(modal.plugin, modal.mediaType, modal.query, page);
    const existingKeys = new Set(state.results.map(resultKey));
    const merged = mergeSearchPages(state.results, [response.results]);
    const appended = merged.filter((result) => !existingKeys.has(resultKey(result)));
    state.loads += 1;
    state.results = merged;
    state.warnings = [...new Set([...state.warnings, ...response.warnings])];
    state.hasMore = response.hasMore && appended.length > 0;
    modal.results = merged;
    modal.warnings = [...state.warnings];

    const scrollTop = modal.contentEl.scrollTop;
    appendSearchResultRows(resultsEl, appended, (result) => modal.createResultRow(result));
    modal.contentEl.scrollTop = scrollTop;
    return appended.length;
  } finally {
    state.loading = false;
  }
}

function renderPagination(modal: LegacyAddMediaModal, state: PaginationState): void {
  modal.contentEl.querySelector(".al-search-pagination")?.remove();
  if (state.initialSearchPending) resetFromInitialSearch(modal, state);
  const currentSignature = searchSignature(modal.mediaType, modal.query);
  if (state.signature !== currentSignature || modal.results.length === 0) {
    state.signature = currentSignature;
    state.results = [...modal.results];
    state.warnings = [...modal.warnings];
    state.loads = 0;
    state.hasMore = modal.results.length > 0;
  }
  if (!canLoadMore(state)) return;

  const resultsEl = modal.contentEl.querySelector<HTMLElement>(".al-search-results");
  if (!resultsEl) return;
  const actions = modal.contentEl.createDiv({ cls: "al-modal-actions al-search-pagination" });
  const button = actions.createEl("button", { text: uiText("add.loadMore"), cls: "al-secondary-button" });
  button.type = "button";
  button.addEventListener("click", () => {
    if (state.loading) return;
    const previousWarningCount = state.warnings.length;
    button.disabled = true;
    button.textContent = uiText("add.loadingMore");
    button.blur();
    void appendNextSearchPage(modal, state, resultsEl)
      .then(() => {
        if (state.warnings.length > previousWarningCount) {
          new Notice(uiText("add.warning", { warnings: state.warnings.join("；") }));
        }
        if (!canLoadMore(state)) actions.remove();
        else {
          button.disabled = false;
          button.textContent = uiText("add.loadMore");
        }
      })
      .catch((error: unknown) => {
        console.error("AnimeList load-more search failed", error);
        button.disabled = false;
        button.textContent = uiText("add.loadMore");
        new Notice(uiText("notice.searchUnavailable"));
      });
  });
  resultsEl.insertAdjacentElement("afterend", actions);
}

function captureLegacyModal(openLegacyModal: () => void): LegacyAddMediaModal | null {
  const openDescriptor = Object.getOwnPropertyDescriptor(Modal.prototype, "open");
  const originalModalOpen: unknown = openDescriptor?.value;
  if (!openDescriptor || typeof originalModalOpen !== "function") return null;
  let captured: LegacyAddMediaModal | null = null;
  Modal.prototype.open = function openAndCapture(this: Modal): void {
    Reflect.apply(originalModalOpen, this, []);
    const candidate = this as Partial<LegacyAddMediaModal>;
    if (this.modalEl.classList.contains("animelist-modal")
      && typeof candidate.renderSearch === "function"
      && typeof candidate.createResultRow === "function") {
      captured = candidate as LegacyAddMediaModal;
    }
  };
  try {
    openLegacyModal();
  } finally {
    Object.defineProperty(Modal.prototype, "open", openDescriptor);
  }
  return captured;
}

function installNativePagination(modal: LegacyAddMediaModal): void {
  const state = freshState();
  const originalRenderSearch = modal.renderSearch;
  const originalSearch = modal.search;
  modal.renderSearch = () => {
    originalRenderSearch.call(modal);
    renderPagination(modal, state);
  };
  modal.search = async (button: HTMLButtonElement) => {
    state.initialSearchPending = true;
    await originalSearch.call(modal, button);
  };
  renderPagination(modal, state);
}

const prototype = LegacyAnimeListPlugin.prototype as unknown as LegacyPluginPrototype;
if (prototype[PATCH_MARKER] !== true) {
  const originalOpenAddModal = prototype.openAddModal;
  prototype.openAddModal = function openAddModalWithNativePagination(
    this: LegacyAnimeListPlugin,
    initialType = "anime",
  ): void {
    const mediaType: MediaType = initialType === "manga" || initialType === "novel" ? initialType : "anime";
    const modal = captureLegacyModal(() => {
      originalOpenAddModal.call(this, mediaType);
    });
    if (modal) installNativePagination(modal);
  };
  Object.defineProperty(prototype, PATCH_MARKER, { value: true });
}
