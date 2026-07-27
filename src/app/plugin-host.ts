import type { App, TFile } from "obsidian";
import type { FeatureRegistry } from "./feature-registry";
import type {
  AnimeListSettings,
  ExternalMediaResult,
  MediaItem,
  MediaNoteForm,
  MediaType,
} from "../types";

export interface AnimeListPluginHost {
  readonly app: App;
  readonly features: FeatureRegistry;
  settings: AnimeListSettings;
  saveSettings(): Promise<void>;
  refreshViews(): void;
  collectMediaItems(source?: string): MediaItem[];
  openMediaFile(path: string): Promise<void>;
  openAddModal(initialType?: MediaType): void;
  openEditModal(path: string): void;
  openTimeline(): Promise<void> | void;
  searchExternal(
    mediaType: MediaType,
    query: string,
  ): Promise<{ results: ExternalMediaResult[]; warnings: string[] }>;
  getTemplates(mediaType: MediaType): Promise<Array<{ path: string; name: string }>>;
  createMediaNote(result: ExternalMediaResult, form: MediaNoteForm): Promise<TFile>;
  setFavorite(path: string, next: boolean): Promise<void>;
  deleteMediaFile(file: TFile): Promise<void>;
  resolveMediaCoverPath(value: unknown, sourcePath: string): string;
}
