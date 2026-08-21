import type { MediaItem, MediaType } from "../domain/media-types";
import type { LibraryFilterOptions, LibraryFilters } from "../domain/library-filters";

export type LibraryMediaFilter = "all" | MediaType;
export type LibraryViewMode = "grid" | "list" | "poster";

export interface LibraryRenderState {
  type?: LibraryMediaFilter;
  status?: string;
  filters?: LibraryFilters;
  /** Legacy read-only compatibility input; normalized into filters.tags. */
  genre?: string;
  query?: string;
  sort?: string;
  view?: LibraryViewMode;
}

export interface LibraryRenderAdapters {
  presentation?: "standalone" | "workspace";
  initialState?: LibraryRenderState;
  initialView?: LibraryViewMode;
  openFile?: (path: string) => void;
  addItem?: (mediaType: MediaType) => void;
  editItem?: (path: string) => void;
  toggleFavorite?: (path: string, next: boolean) => Promise<void> | void;
  onStateChange?: (state: LibraryRenderState) => void;
  afterRender?: (state: LibraryRenderState) => void;
  requiresCompleteDom?: (state: LibraryRenderState) => boolean;
  onViewChange?: (view: LibraryViewMode) => void;
  openTimeline?: () => void;
  openFilterModal?: (filters: LibraryFilters, options: LibraryFilterOptions, onApply: (filters: LibraryFilters) => void) => void;
  extraStatusFilters?: (type: string) => Array<[string, string]>;
  matchesStatusFilter?: (item: unknown, filter: string) => boolean | undefined;
}

export interface LibraryRenderContext<Host> {
  host: Host;
  container: HTMLElement;
  items: MediaItem[];
  adapters: LibraryRenderAdapters;
  state?: LibraryRenderState;
}

export interface LibraryRenderer {
  renderLibrary(
    container: HTMLElement,
    items: MediaItem[],
    adapters?: LibraryRenderAdapters,
  ): void;
}
