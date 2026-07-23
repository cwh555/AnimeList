export type MediaType = "anime" | "manga" | "novel";
export type StorageMode = "managed" | "flat";
export type LibrarySection = "library" | "timeline";
export type LibraryViewMode = "grid" | "list" | "poster";
export type ReleaseStatus = "releasing" | "finished" | "hiatus" | "cancelled" | "unknown";
export type ProgressValue = number | string;
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
  searchLanguages?: SearchLanguageSettings;
  uiState: LibraryUiState;
}

export interface TemplateOption {
  path: string;
  name: string;
}

export interface NovelVolumeEntry {
  label: string;
  startedAt: string;
  completedAt: string;
}

export interface CoverSources {
  src: string;
  srcset: string;
  placeholder: string;
}

export interface MediaItem {
  title: string;
  originalTitle: string;
  mediaType: MediaType;
  format: string;
  status: string;
  releaseStatus: ReleaseStatus;
  progress: ProgressValue;
  total: ProgressValue;
  unit: string;
  score: number | null;
  favorite: boolean;
  year: number | string;
  genres: string[];
  people: string[];
  platforms: string[];
  sourceUrls: string[];
  cover: string;
  coverSources?: CoverSources;
  filePath: string;
  updated: number;
  updatedLabel: string;
  startedAt: string;
  completedAt: string;
  volumeLog: NovelVolumeEntry[];
}

export interface TimelineMediaEntry extends MediaItem {
  seriesTitle?: string;
  volumeLabel?: string;
}

export interface ExternalMediaResult {
  provider: string;
  sourceId: string;
  title: string;
  originalTitle: string;
  romajiTitle: string;
  mediaType: MediaType;
  format: string;
  total: number;
  unit: string;
  year: number | string;
  genres: string[];
  rawGenres: string[];
  people: string[];
  platforms: string[];
  sourceUrl: string;
  coverUrl: string;
  summary: string;
  externalScore: number | null;
  releaseStatus: ReleaseStatus;
  searchTitles?: string[];
}

export interface MediaNoteForm {
  title: string;
  status: string;
  releaseStatus: ReleaseStatus;
  progress: ProgressValue;
  total: ProgressValue;
  unit: string;
  score: number | string | null;
  favorite: boolean;
  startedAt: string;
  completedAt: string;
  genres: string[];
  templatePath: string;
  volumeLog: NovelVolumeEntry[];
}
