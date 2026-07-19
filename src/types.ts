export type MediaType = "anime" | "manga" | "novel";
export type StorageMode = "managed" | "flat";
export type LibrarySection = "library" | "timeline";
export type LibraryViewMode = "grid" | "list" | "poster";

export interface ProviderSettings {
  bangumi: boolean;
  anilist: boolean;
  openlibrary: boolean;
}

export interface LibraryUiState {
  section: LibrarySection;
  type: "all" | MediaType;
  status: string;
  genre: string;
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
  providers: ProviderSettings;
  uiState: LibraryUiState;
}

export interface TemplateOption {
  path: string;
  name: string;
}

export interface MediaItem {
  title: string;
  originalTitle: string;
  mediaType: MediaType;
  format: string;
  status: string;
  progress: number;
  total: number;
  unit: string;
  score: number | null;
  favorite: boolean;
  year: number | string;
  genres: string[];
  people: string[];
  platforms: string[];
  sourceUrls: string[];
  cover: string;
  filePath: string;
  updated: number;
  updatedLabel: string;
  startedAt: string;
  completedAt: string;
}
