import { Notice } from "obsidian";
import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { dedupeSearchResults } from "../../data/provider-normalizers";
import { sameMediaIdentity } from "../../domain/search/entity-resolution";
import type { SearchModalAdapter } from "../../ui/search-contracts";
import { uiText } from "../../ui-text";
import type { ExternalMediaResult, MediaType } from "../../types";

export const SEARCH_PAGINATION_LIMITS = {
  pageSize: 24,
  maxLoads: 2,
  maxResults: 72,
} as const;

interface AppendTarget<Node> {
  appendChild(node: Node): unknown;
}

interface PaginatedSearchModal extends SearchModalAdapter {
  mediaType: MediaType;
  query: string;
  results: ExternalMediaResult[];
  warnings: string[];
}

export interface PaginationState {
  signature: string;
  results: ExternalMediaResult[];
  warnings: string[];
  loads: number;
  hasMore: boolean;
  loading: boolean;
  sourceResults: ExternalMediaResult[] | null;
  loadToken?: object;
  sessionId?: string | null;
}

export function mergeSearchPages(
  initial: ExternalMediaResult[],
  pages: ExternalMediaResult[][],
): ExternalMediaResult[] {
  return dedupeSearchResults([initial, ...pages].flat())
    .slice(0, SEARCH_PAGINATION_LIMITS.maxResults);
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
    sourceResults: null,
    sessionId: null,
  };
}

function resetFromInitialSearch(modal: PaginatedSearchModal, state: PaginationState): void {
  state.signature = searchSignature(modal.mediaType, modal.query);
  state.results = [...modal.results];
  state.warnings = [...modal.warnings];
  state.loads = 0;
  state.hasMore = modal.hasMore ?? modal.results.length > 0;
  state.loading = false;
  state.loadToken = undefined;
  state.sourceResults = modal.results;
  state.sessionId = modal.sessionId ?? null;
}

export function synchronizePaginationState(
  modal: PaginatedSearchModal,
  state: PaginationState,
): void {
  const currentSignature = searchSignature(modal.mediaType, modal.query);
  if (state.sourceResults !== modal.results || state.signature !== currentSignature
    || state.sessionId !== (modal.sessionId ?? null)) {
    resetFromInitialSearch(modal, state);
  }
}

function canLoadMore(state: PaginationState): boolean {
  return state.hasMore
    && !state.loading
    && state.loads < SEARCH_PAGINATION_LIMITS.maxLoads
    && state.results.length < SEARCH_PAGINATION_LIMITS.maxResults;
}

export async function appendNextSearchPage(
  host: Pick<AnimeListFeatureHost, "searchExternalPage">,
  modal: PaginatedSearchModal,
  state: PaginationState,
  resultsEl: AppendTarget<HTMLElement>,
): Promise<number> {
  if (!canLoadMore(state)) return 0;
  state.loading = true;
  const token = {};
  state.loadToken = token;
  const page = state.loads + 2;
  const signature = state.signature;
  const startingResults = state.sourceResults;
  const requestMediaType = modal.mediaType;
  const requestQuery = modal.query;
  const sessionId = state.sessionId ?? undefined;
  try {
    const response = await host.searchExternalPage(requestMediaType, requestQuery, page, sessionId);
    // A new search may have started while a provider request was pending.
    // Never insert stale rows into a different query's result container.
    if (state.signature !== signature || state.sourceResults !== startingResults
      || state.sessionId !== (sessionId ?? null)
      || searchSignature(modal.mediaType, modal.query) !== signature) return 0;
    const existingResults = state.results;
    const merged = mergeSearchPages(existingResults, [response.results]);
    const appended = merged.filter((result) => !existingResults.some(
      (existing) => sameMediaIdentity(existing, result),
    ));
    state.loads += 1;
    state.results = merged;
    state.warnings = [...new Set([...state.warnings, ...response.warnings])];
    // A provider page can contain only duplicates; later pages may still have matches.
    state.hasMore = response.hasMore;
    state.sourceResults = merged;
    modal.results = merged;
    modal.warnings = [...state.warnings];
    modal.hasMore = state.hasMore;

    const scrollTop = modal.contentEl.scrollTop;
    appendSearchResultRows(resultsEl, appended, (result) => modal.createResultRow(result));
    modal.contentEl.scrollTop = scrollTop;
    return appended.length;
  } finally {
    if (state.loadToken === token) {
      state.loading = false;
      state.loadToken = undefined;
    }
  }
}

function renderPagination(
  host: AnimeListFeatureHost,
  modal: PaginatedSearchModal,
  state: PaginationState,
): void {
  modal.contentEl.querySelector(".al-search-pagination")?.remove();
  synchronizePaginationState(modal, state);
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
    void appendNextSearchPage(host, modal, state, resultsEl)
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

const PAGINATION_STATES = new WeakMap<object, PaginationState>();

export const searchPaginationFeature = defineFeature<AnimeListFeatureHost>({
  id: "search-pagination",
  contributions: [{
    kind: "search",
    afterRender({ host, modal }): void {
      let state = PAGINATION_STATES.get(modal);
      if (!state) {
        state = freshState();
        PAGINATION_STATES.set(modal, state);
      }
      renderPagination(host, modal, state);
    },
  }],
});
