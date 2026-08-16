import type { MediaStatusFilter } from "./media-status";
import type { SpecialLabelMode } from "./masterpiece-labels";
import type { MediaType } from "./media-types";
import type { LibraryFilters } from "./library-filters";
import type { LanguagePreference } from "../i18n/locale";
export type { LanguagePreference } from "../i18n/locale";

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

export interface ReleaseTrackingSettings {
  enabled: boolean;
  automatic: boolean;
  lastAutomaticCheckAt: string;
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
  interfaceLanguage: LanguagePreference;
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
  releaseTracking: ReleaseTrackingSettings;
  migrations: MigrationSettings;
  uiState: LibraryUiState;
}
