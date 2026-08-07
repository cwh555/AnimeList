import { TFile, normalizePath, type App } from "obsidian";
import { CoverThumbnailCache } from "../cover-cache";
import { ExternalMediaSearchService } from "../data/external-media-service";
import { createMetadataProviderClients, type HttpMetadataProviderClients } from "../data/metadata-provider-clients";
import { isLibraryRelevantPath, pathBelongsToLibraryRoot } from "../data/library-change-scope";
import { LibraryStorage } from "../data/library-storage";
import { MediaClassificationService } from "../data/media-classification-service";
import { MediaLibraryIndex } from "../data/media-library-index";
import { MediaNoteService } from "../data/media-note-service";
import { MediaRepository } from "../data/media-repository";
import { MediaUpdateService } from "../data/media-update-service";
import { SpecialLabelStateService } from "../data/special-label-state-service";
import { storedMediaExternalResult } from "../data/stored-media-result";
import type { AnimeListSettings, ExternalMediaResult, ExternalMediaSearchPage, MediaItem, MediaNoteForm, MediaType } from "../types";
import { getScopedMarkdownFiles } from "../vault-scope";

export interface AnimeListApplicationCallbacks {
  openMediaFile(path: string): Promise<void>;
  refreshViews(): void;
}

export class AnimeListApplicationServices {
  private coverCache?: CoverThumbnailCache;
  private mediaRepository?: MediaRepository;
  private mediaIndex?: MediaLibraryIndex;
  private classificationService?: MediaClassificationService;
  private storage?: LibraryStorage;
  private providerClients?: HttpMetadataProviderClients;
  private searchService?: ExternalMediaSearchService;
  private noteService?: MediaNoteService;
  private updateService?: MediaUpdateService;
  private specialLabelService?: SpecialLabelStateService;

  constructor(
    private readonly app: App,
    private readonly pluginId: string,
    private readonly settings: () => AnimeListSettings,
    private readonly callbacks: AnimeListApplicationCallbacks,
  ) {}

  async initialize(): Promise<void> {
    this.coverCache = new CoverThumbnailCache(this.app, this.pluginId, () => this.callbacks.refreshViews());
    await this.coverCache.initialize();
    this.mediaRepository = new MediaRepository(this.app, (file) => this.coverCache?.getDeferredSources(file));
    this.coverCache.scheduleCleanup();
  }

  dispose(): void { this.coverCache?.dispose(); }

  private libraryStorage(): LibraryStorage {
    this.storage ??= new LibraryStorage(this.app, this.settings);
    return this.storage;
  }

  private repository(): MediaRepository {
    this.mediaRepository ??= new MediaRepository(this.app, (file) => this.coverCache?.getDeferredSources(file));
    return this.mediaRepository;
  }

  private libraryIndex(): MediaLibraryIndex {
    this.mediaIndex ??= new MediaLibraryIndex(this.app, this.repository());
    return this.mediaIndex;
  }

  private metadataProviders(): HttpMetadataProviderClients {
    this.providerClients ??= createMetadataProviderClients();
    return this.providerClients;
  }

  private externalMediaSearch(): ExternalMediaSearchService {
    this.searchService ??= new ExternalMediaSearchService(
      () => this.settings().providers,
      this.metadataProviders(),
      () => this.settings().searchLanguages,
    );
    return this.searchService;
  }

  private mediaClassification(): MediaClassificationService {
    this.classificationService ??= new MediaClassificationService(this.metadataProviders().anilist);
    return this.classificationService;
  }

  private mediaNotes(): MediaNoteService {
    this.noteService ??= new MediaNoteService(
      this.app,
      this.settings,
      this.repository(),
      this.libraryStorage(),
      { optimizeFile: (file) => this.coverCache?.optimizeFile(file) ?? Promise.resolve() },
      this.callbacks,
    );
    return this.noteService;
  }

  private mediaUpdates(): MediaUpdateService {
    this.updateService ??= new MediaUpdateService(this.app, { refreshViews: () => this.callbacks.refreshViews() });
    return this.updateService;
  }

  private specialLabels(): SpecialLabelStateService {
    this.specialLabelService ??= new SpecialLabelStateService(
      this.app,
      { refreshViews: () => this.callbacks.refreshViews() },
    );
    return this.specialLabelService;
  }

  getManagedMediaFolder(mediaType: MediaType): string { return this.libraryStorage().managedMediaFolder(mediaType); }
  getMediaFolder(mediaType: MediaType): string { return this.libraryStorage().mediaFolder(mediaType); }
  getScanFolders(): string[] { return this.libraryStorage().scanFolders(); }
  isLibraryRelevantPath(path: string): boolean {
    return isLibraryRelevantPath(path, this.getScanFolders(), this.settings().coverFolder);
  }

  handleLibraryMetadataChange(file: TFile): boolean {
    if (!this.isLibraryRelevantPath(file.path)) return false;
    const roots = this.getScanFolders();
    if (roots.some((root) => pathBelongsToLibraryRoot(file.path, root))) {
      this.mediaIndex?.update(file, roots);
    } else {
      this.mediaIndex?.invalidate();
    }
    return true;
  }

  handleLibraryDelete(path: string, isFile: boolean): boolean {
    if (!this.isLibraryRelevantPath(path)) return false;
    const roots = this.getScanFolders();
    const mediaPath = roots.some((root) => pathBelongsToLibraryRoot(path, root));
    if (mediaPath && isFile) this.mediaIndex?.remove(path);
    else this.mediaIndex?.invalidate();
    return true;
  }

  handleLibraryRename(file: TFile | null, oldPath: string, newPath: string): boolean {
    if (!this.isLibraryRelevantPath(oldPath) && !this.isLibraryRelevantPath(newPath)) return false;
    const roots = this.getScanFolders();
    const oldMediaPath = roots.some((root) => pathBelongsToLibraryRoot(oldPath, root));
    const newMediaPath = roots.some((root) => pathBelongsToLibraryRoot(newPath, root));
    if (file && (oldMediaPath || newMediaPath)) {
      this.mediaIndex?.rename(oldPath, newMediaPath ? file : null, roots);
    } else {
      this.mediaIndex?.invalidate();
    }
    return true;
  }
  async initializeLibrary(copyTemplates = false): Promise<void> { await this.libraryStorage().initialize(copyTemplates); }
  resolveMediaCoverFile(value: unknown, sourcePath: string): TFile | null { return this.repository().resolveCoverFile(value, sourcePath); }
  resolveMediaCoverPath(value: unknown, sourcePath: string): string { return this.repository().resolveCoverPath(value, sourcePath); }

  collectMediaItems(source?: string): MediaItem[] {
    if (source) {
      const root = normalizePath(source).replace(/^\/+|\/+$/g, "");
      return this.repository().collect([root]);
    }
    const roots = this.getScanFolders();
    return this.libraryIndex().snapshot(roots);
  }

  localCoverFiles(): TFile[] {
    const unique = new Map<string, TFile>();
    for (const note of getScopedMarkdownFiles(this.app, this.getScanFolders())) {
      const frontmatter = this.app.metadataCache.getFileCache(note)?.frontmatter;
      const cover = this.resolveMediaCoverFile(frontmatter?.cover, note.path);
      if (cover) unique.set(cover.path, cover);
    }
    return [...unique.values()];
  }

  async optimizeCovers(
    files: TFile[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<{ optimized: number; failed: number }> {
    if (!this.coverCache) throw new Error("Cover cache is not initialized");
    return this.coverCache.optimizeFiles(files, onProgress);
  }

  async clearCoverCache(): Promise<number> {
    if (!this.coverCache) throw new Error("Cover cache is not initialized");
    return this.coverCache.clear();
  }

  async setFavorite(path: string, next: boolean): Promise<void> { await this.specialLabels().setFavorite(path, next); }
  async updateSpecialLabelState(path: string, favorite: boolean, labels: string[]): Promise<void> {
    await this.specialLabels().update(path, { favorite, masterpieceLabels: labels });
  }
  async deleteMediaFile(file: TFile): Promise<void> { await this.app.fileManager.trashFile(file); }
  async getTemplates(mediaType: MediaType): Promise<Array<{ path: string; name: string }>> { return this.libraryStorage().templates(mediaType); }
  async readTemplate(path: string): Promise<string> { return this.libraryStorage().readTemplate(path); }
  async searchExternal(mediaType: MediaType, query: string): Promise<{ results: ExternalMediaResult[]; warnings: string[] }> { return this.externalMediaSearch().search(mediaType, query); }
  async searchExternalPage(mediaType: MediaType, query: string, page: number): Promise<ExternalMediaSearchPage> { return this.externalMediaSearch().searchPage(mediaType, query, page); }
  async searchBangumi(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]> { return this.externalMediaSearch().searchProvider("bangumi", mediaType, query); }
  async searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]> { return this.externalMediaSearch().searchProvider("anilist", mediaType, query); }
  async searchOpenLibrary(query: string): Promise<ExternalMediaResult[]> { return this.externalMediaSearch().searchProvider("openlibrary", "novel", query); }
  async enrichExternalMedia(result: ExternalMediaResult): Promise<ExternalMediaResult> {
    let base = result;
    if (result.provider === "bangumi" && result.sourceId && (!result.people.length || !result.rawGenres.length)) {
      try {
        base = await this.metadataProviders().bangumi.fetchById(result.mediaType, result.sourceId) ?? result;
      } catch (error) {
        console.warn("AnimeList Bangumi metadata refresh failed; continuing with stored metadata", error);
      }
    }
    return this.mediaClassification().enrichOrOriginal(base, (error) => {
      console.warn("AnimeList metadata enrichment failed; continuing without classification metadata", error);
    });
  }
  async enrichStoredMedia(frontmatter: Record<string, unknown>, mediaType: MediaType): Promise<ExternalMediaResult> {
    return this.enrichExternalMedia(storedMediaExternalResult(frontmatter, mediaType));
  }
  async ensureFolder(path: string): Promise<void> { await this.libraryStorage().ensureFolder(path); }
  findExistingBySource(provider: string, sourceId: string): TFile | undefined { return this.repository().findBySource(this.getScanFolders(), provider, sourceId); }
  async uniqueFilePath(folder: string, baseName: string, extension: string): Promise<string> { return this.libraryStorage().uniqueFilePath(folder, baseName, extension); }
  async downloadCover(result: ExternalMediaResult): Promise<string> { return this.mediaNotes().downloadCover(result); }
  async createMediaNote(result: ExternalMediaResult, form: MediaNoteForm): Promise<TFile> {
    if (result.sourceId && this.repository().findBySource(this.getScanFolders(), result.provider, result.sourceId)) {
      return this.mediaNotes().create(result, form);
    }
    const enriched = await this.enrichExternalMedia(result);
    const originalGenres = result.genres ?? [];
    const formGenres = form.genres ?? [];
    const genresWereUnchanged = formGenres.length === originalGenres.length
      && formGenres.every((genre, index) => genre === originalGenres[index]);
    const preparedForm = genresWereUnchanged && enriched.genres.length
      ? { ...form, genres: enriched.genres }
      : form;
    return this.mediaNotes().create(enriched, preparedForm);
  }
  async updateMediaNote(file: TFile, mediaType: MediaType, form: MediaNoteForm): Promise<void> { await this.mediaUpdates().update(file, mediaType, form); }
}
