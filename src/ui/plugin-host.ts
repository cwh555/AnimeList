import type { App, TFile } from "obsidian";
import type {
  AnimeListSettings,
  ExternalMediaResult,
  MediaItem,
  MediaNoteForm,
  MediaType,
} from "../types";
import type { LibraryRenderAdapters, LibraryViewMode } from "./library-contracts";
import type { MediaFormContext, MediaFormSubmitContext } from "./media-form-contracts";
import type { SearchModalAdapter } from "./search-contracts";

export interface AnimeListUiHost {
  app: App;
  settings: AnimeListSettings;
  readonly libraryViewModes: Map<string, LibraryViewMode>;

  renderLibrary(container: HTMLElement, items: MediaItem[], adapters?: LibraryRenderAdapters): void;
  collectMediaItems(source?: string): MediaItem[];
  getScanFolders(): string[];
  resolveMediaCoverPath(value: unknown, sourcePath: string): string;
  searchExternal(mediaType: MediaType, query: string): Promise<{
    results: ExternalMediaResult[];
    warnings: string[];
  }>;
  enrichExternalMedia(result: ExternalMediaResult): Promise<ExternalMediaResult>;
  enrichStoredMedia(frontmatter: Record<string, unknown>, mediaType: MediaType): Promise<ExternalMediaResult>;
  getTemplates(mediaType: MediaType): Promise<Array<{ path: string; name: string }>>;
  createMediaNote(result: ExternalMediaResult, form: MediaNoteForm): Promise<TFile>;
  updateMediaNote(file: TFile, mediaType: MediaType, form: MediaNoteForm): Promise<void>;
  deleteMediaFile(file: TFile): Promise<void>;
  setFavorite(path: string, next: boolean): Promise<void>;
  openLibrary(): Promise<void>;
  openTimeline(): Promise<void>;
  openAddModal(mediaType?: MediaType): void;
  openEditModal(path: string): void;

  afterSearchRender(modal: SearchModalAdapter): void;
  configureMediaForm(context: MediaFormContext<AnimeListUiHost>): void;
  prepareMediaSubmit(context: MediaFormSubmitContext<AnimeListUiHost>): Promise<void>;
  afterDetailRender(container: HTMLElement, sourcePath: string, frontmatter: Record<string, unknown>): void;
}
