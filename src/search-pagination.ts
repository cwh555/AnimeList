import { Notice } from "obsidian";
import { defineFeature, type AnimeListFeatureHost } from "./app/feature-types";
import {
  fetchExternalSearchPage,
  type ExternalSearchPageSettings,
} from "./data/external-media-pagination";
import { dedupeSearchResults } from "./data/provider-normalizers";
import type { SearchModalAdapter } from "./ui/search-contracts";
import { uiText } from "./ui-text";
import type { ExternalMediaResult, MediaType } from "./types";

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
  initialSearchPending: boolean;
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

function resetFromInitialSearch(modal: PaginatedSearchModal, state: PaginationState): void {
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

export async function appendNextSearchPage(
  settings: ExternalSearchPageSettings,
  modal: PaginatedSearchModal,
  state: PaginationState,
  resultsEl: AppendTarget<HTMLElement>,
): Promise<number> {
  if (!canLoadMore(state)) return 0;
  state.loading = true;
  const page = state.loads + 2;
  try {
    const response = await fetchExternalSearchPage(settings, modal.mediaType, modal.query, page);
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

function renderPagination(
  settings: ExternalSearchPageSettings,
  modal: PaginatedSearchModal,
  state: PaginationState,
): void {
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
    void appendNextSearchPage(settings, modal, state, resultsEl)
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
      renderPagination(host.settings, modal, state);
    },
  }],
});
