import type { MediaStatusFilter } from "../media-status";
import type { SpecialLabelMode } from "../masterpiece-labels";
import type { MediaType } from "./media-types";
import type { LibraryFilters } from "./library-filters";

export type StorageMode = "managed" | "flat";
export type LibrarySection = "library" | "timeline";
export type LibraryViewMode = "grid" | "list" | "poster";
export type SearchLanguage = "chinese" | "english" | "original";

export interface ProviderSettings {
  bangumi: boolean;
  anilist: boolean;
  openlibrary: boolean;
}

export interface SearchLanguageSettings {
  chinese: boolean;
  english: boolean;
  original: boolean;
}

export interface MigrationSettings {
  mediaStatus: number;
}

export interface LibraryUiState {
  section: LibrarySection;
  type: "all" | MediaType;
  status: MediaStatusFilter;
  filters: LibraryFilters;
  sort: string;
  view: LibraryViewMode;
}

export interface AnimeListSettings {
  storageMode: StorageMode;
  libraryRoot: string;
  flatMediaFolder: string;
  additionalScanFolders: string[];
  coverFolder: string;
  templateFolder: string;
  timelineMaxStackDepth: number;
  providers: ProviderSettings;
  googleBooksApiKey: string;
  searchLanguages: SearchLanguageSettings;
  tagCatalog: string[];
  specialLabelMode: SpecialLabelMode;
  migrations: MigrationSettings;
  uiState: LibraryUiState;
}
