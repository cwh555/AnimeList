import type { MediaItem, MediaType } from "../domain/media-types";

export type LibraryMediaFilter = "all" | MediaType;
export type LibraryViewMode = "grid" | "list" | "poster";

export interface LibraryRenderState {
  type?: LibraryMediaFilter;
  status?: string;
  genre?: string;
  query?: string;
  sort?: string;
  view?: LibraryViewMode;
}

export interface LibraryRenderAdapters {
  initialState?: LibraryRenderState;
  initialView?: LibraryViewMode;
  openFile?: (path: string) => void;
  addItem?: (mediaType: MediaType) => void;
  editItem?: (path: string) => void;
  toggleFavorite?: (path: string, next: boolean) => Promise<void> | void;
  onStateChange?: (state: LibraryRenderState) => void;
  afterRender?: (state: LibraryRenderState) => void;
  onViewChange?: (view: LibraryViewMode) => void;
  openTimeline?: () => void;
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
