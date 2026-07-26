import { AnimeListUI } from "./legacy";
import type { MediaType } from "./types";

export interface LibraryRenderState {
  type?: string;
  status?: string;
  genre?: string;
  query?: string;
  sort?: string;
  view?: string;
  [key: string]: unknown;
}

export interface LibraryRenderAdapters {
  initialState?: LibraryRenderState;
  initialView?: string;
  openFile?: (path: string) => void;
  addItem?: (mediaType: MediaType) => void;
  editItem?: (path: string) => void;
  toggleFavorite?: (path: string, next: boolean) => Promise<void> | void;
  onStateChange?: (state: LibraryRenderState) => void;
  openTimeline?: () => void;
  extraStatusFilters?: (type: string) => Array<[string, string]>;
  matchesStatusFilter?: (item: unknown, filter: string) => boolean | undefined;
  [key: string]: unknown;
}

export interface LegacyLibraryRenderer {
  renderLibrary: (
    container: HTMLElement,
    inputItems: unknown[],
    adapters?: LibraryRenderAdapters,
  ) => void;
}

export const legacyLibraryRenderer: LegacyLibraryRenderer = AnimeListUI;
