import type { MediaStatus } from "../media-status";
import type { MediaClassification } from "./media-classification";

export type MediaType = "anime" | "manga" | "novel";
export type ReleaseStatus = "releasing" | "finished" | "hiatus" | "cancelled" | "unknown";
export type ProgressValue = number | string;

export interface TemplateOption {
  path: string;
  name: string;
}

export interface SerialProgressEntry {
  label: string;
  startedAt: string;
  completedAt: string;
  cover?: string;
  coverProvider?: string;
  coverSourceId?: string;
  coverManual?: boolean;
  extra?: Record<string, unknown>;
}

export type NovelVolumeEntry = SerialProgressEntry;

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
  status: MediaStatus;
  releaseStatus: ReleaseStatus;
  progress: ProgressValue;
  total: ProgressValue;
  unit: string;
  score: number | null;
  favorite: boolean;
  year: number | string;
  genres: string[];
  mediaTags?: string[];
  userTags?: string[];
  season?: string;
  seasonYear?: number | string;
  sourceMaterial?: string;
  countryOfOrigin?: string;
  anilistId?: string;
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
  volumeLog: SerialProgressEntry[];
}

export interface TimelineMediaEntry extends MediaItem {
  seriesTitle?: string;
  volumeLabel?: string;
  serialEntryLabel?: string;
}

export interface ExternalMediaSourceRef {
  provider: string;
  sourceId: string;
  sourceUrl: string;
}

export interface ExternalMediaSearchPage {
  results: ExternalMediaResult[];
  warnings: string[];
  hasMore: boolean;
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
  sources?: ExternalMediaSourceRef[];
  classification?: MediaClassification;
}

export interface MediaNoteForm {
  title: string;
  status: MediaStatus;
  releaseStatus: ReleaseStatus;
  progress: ProgressValue;
  total: ProgressValue;
  unit: string;
  score: number | string | null;
  favorite: boolean;
  startedAt: string;
  completedAt: string;
  genres: string[];
  userTags?: string[];
  templatePath: string;
  volumeLog: SerialProgressEntry[];
}
