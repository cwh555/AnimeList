/* eslint-disable @typescript-eslint/no-misused-promises -- Boundary adapter for Obsidian event callbacks. */
import {
  ItemView,
  Notice,
  TFile,
  WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import LegacyAnimeListPlugin, {
  AnimeListRenderChild,
  AnimeListUI,
  DetailActionsRenderChild,
  TimelineModal,
} from "./legacy";
import { CoverThumbnailCache } from "./cover-cache";
import { MediaRepository } from "./data/media-repository";
import {
  ExternalMediaSearchService,
  HttpMetadataProviderClient,
  type MetadataProviderClient,
} from "./data/external-media-service";
import { LibraryStorage } from "./data/library-storage";
import { MediaNoteService } from "./data/media-note-service";
import { AnimeListSettingTab } from "./settings";
import { createDefaultSettings } from "./settings-model";
import { AnimeListSettingsStore } from "./settings-store";
import { uiText } from "./ui-text";
import {
  MEDIA_STATUS_MIGRATION_VERSION,
  migrateMediaStatusNotes,
} from "./schema-migration";
import type {
  AnimeListSettings,
  ExternalMediaResult,
  LibrarySection,
  MediaItem,
  MediaNoteForm,
  MediaType,
} from "./types";
import { getScopedMarkdownFiles } from "./vault-scope";

const VIEW_TYPE = "animelist-library";
const DISPLAY_NAME = "AnimeList";

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : typeof value === "string" ? value : "Unknown error";
}

class AnimeListView extends ItemView {
  private readonly plugin: AnimeListPlugin;
  private section: LibrarySection;
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AnimeListPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.section = plugin.settings.uiState.section;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return DISPLAY_NAME;
  }

  getIcon(): string {
    return "library";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  scheduleRender(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.render();
    }, 100);
  }

  async showSection(section: LibrarySection): Promise<void> {
    this.section = section;
    this.plugin.settings.uiState.section = section;
    await this.plugin.saveSettings();
    await this.render();
  }

  private async render(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("animelist-native-view");
    const items = this.plugin.collectMediaItems();

    AnimeListUI.renderLibrary(this.contentEl, items, {
      initialState: this.plugin.settings.uiState,
      onStateChange: (state: AnimeListSettings["uiState"]) => this.plugin.updateUiState(state),
      openFile: (path: string) => void this.plugin.openMediaFile(path),
      addItem: (mediaType: MediaType) => this.plugin.openAddModal(mediaType),
      editItem: (path: string) => this.plugin.openEditModal(path),
      toggleFavorite: async (path: string, next: boolean) => {
        await this.plugin.setFavorite(path, next);
        this.scheduleRender();
      },
      openTimeline: () => void this.plugin.openTimeline(),
    });
  }
}

export class AnimeListPlugin extends LegacyAnimeListPlugin {
  settings: AnimeListSettings = createDefaultSettings();
  private saveUiTimer: number | null = null;
  private coverCache?: CoverThumbnailCache;
  private mediaRepository?: MediaRepository;
  private storage?: LibraryStorage;
  private providerClient?: MetadataProviderClient;
  private searchService?: ExternalMediaSearchService;
  private noteService?: MediaNoteService;

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.migrateMediaStatuses();
    this.coverCache = new CoverThumbnailCache(this.app, this.manifest.id);
    await this.coverCache.initialize();
    this.mediaRepository = new MediaRepository(this.app, (file) => this.coverCache?.getSources(file));
    this.coverCache.scheduleCleanup();
    this.register(() => this.coverCache?.dispose());

    this.registerView(VIEW_TYPE, (leaf) => new AnimeListView(leaf, this));
    this.addRibbonIcon("library", uiText("app.openLibrary"), () => void this.openLibrary());

    this.registerMarkdownCodeBlockProcessor("animelist", (source, element, context) => {
      const child = new AnimeListRenderChild(element, this, context.sourcePath, this.parseLegacyConfig(source));
      context.addChild(child);
    });
    this.registerMarkdownCodeBlockProcessor("animelist-detail", (_source, element, context) => {
      const child = new DetailActionsRenderChild(element, this, context.sourcePath);
      context.addChild(child);
    });

    this.addCommand({ id: "open-library", name: uiText("app.openLibrary"), callback: () => void this.openLibrary() });
    this.addCommand({ id: "add-media", name: uiText("action.collect"), callback: () => this.openAddModal("anime") });
    this.addCommand({ id: "open-timeline", name: uiText("app.openTimeline"), callback: () => void this.openTimeline() });
    this.addCommand({ id: "initialize-library", name: uiText("app.initializeLibrary"), callback: () => void this.initializeLibrary(false) });
    this.addCommand({ id: "optimize-cover-thumbnails", name: uiText("app.optimizeCovers"), callback: () => void this.optimizeExistingCovers() });
    this.addCommand({ id: "clear-cover-thumbnail-cache", name: uiText("app.clearCoverCache"), callback: () => void this.clearCoverCache() });
    this.addSettingTab(new AnimeListSettingTab(this.app, this));

    this.registerEvent(this.app.metadataCache.on("changed", () => this.refreshViews()));
    this.registerEvent(this.app.vault.on("delete", () => this.refreshViews()));
    this.registerEvent(this.app.vault.on("rename", () => this.refreshViews()));
  }


  private parseLegacyConfig(source: string): Record<string, string> {
    const config: Record<string, string> = {};
    source.split("\n").forEach((line) => {
      const index = line.indexOf(":");
      if (index < 0) return;
      config[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    });
    return config;
  }

  private settingsStore(): AnimeListSettingsStore {
    return new AnimeListSettingsStore(this);
  }

  private libraryStorage(): LibraryStorage {
    this.storage ??= new LibraryStorage(this.app, () => this.settings);
    return this.storage;
  }

  private repository(): MediaRepository {
    this.mediaRepository ??= new MediaRepository(
      this.app,
      (file) => this.coverCache?.getSources(file),
    );
    return this.mediaRepository;
  }

  private metadataProviderClient(): MetadataProviderClient {
    this.providerClient ??= new HttpMetadataProviderClient();
    return this.providerClient;
  }

  private externalMediaSearch(): ExternalMediaSearchService {
    this.searchService ??= new ExternalMediaSearchService(
      () => this.settings.providers,
      {
        searchBangumi: (mediaType, query) => this.searchBangumi(mediaType, query),
        searchAniList: (mediaType, query) => this.searchAniList(mediaType, query),
        searchOpenLibrary: (query) => this.searchOpenLibrary(query),
      },
    );
    return this.searchService;
  }

  private mediaNotes(): MediaNoteService {
    this.noteService ??= new MediaNoteService(
      this.app,
      () => this.settings,
      this.repository(),
      this.libraryStorage(),
      { optimizeFile: (file) => this.coverCache?.optimizeFile(file) ?? Promise.resolve() },
      {
        openMediaFile: (path) => this.openMediaFile(path),
        refreshViews: () => this.refreshViews(),
      },
    );
    return this.noteService;
  }

  async loadSettings(): Promise<void> {
    this.settings = await this.settingsStore().load();
  }

  private async migrateMediaStatuses(): Promise<void> {
    if (this.settings.migrations.mediaStatus >= MEDIA_STATUS_MIGRATION_VERSION) return;
    try {
      const result = await migrateMediaStatusNotes(this.app, this.getScanFolders());
      this.settings.migrations.mediaStatus = MEDIA_STATUS_MIGRATION_VERSION;
      await this.saveSettings();
      if (result.total > 0) {
        new Notice(uiText("notice.statusMigration", { count: result.total }));
      }
    } catch (error) {
      console.error("AnimeList media-status migration failed", error);
      new Notice(uiText("notice.statusMigrationFailed", { error: errorMessage(error) }));
    }
  }

  async saveSettings(): Promise<void> {
    this.settings = await this.settingsStore().save(this.settings);
  }

  updateUiState(state: AnimeListSettings["uiState"]): void {
    this.settings.uiState = {
      ...this.settings.uiState,
      type: state.type,
      status: state.status,
      genre: state.genre,
      sort: state.sort,
      view: state.view,
    };
    if (this.saveUiTimer !== null) window.clearTimeout(this.saveUiTimer);
    this.saveUiTimer = window.setTimeout(() => {
      this.saveUiTimer = null;
      void this.saveSettings();
    }, 250);
  }

  refreshViews(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof AnimeListView) leaf.view.scheduleRender();
    });
  }

  async openLibrary(): Promise<void> {
    await this.initializeLibrary(false);
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof AnimeListView) await leaf.view.showSection("library");
  }

  async openTimeline(): Promise<void> {
    await this.initializeLibrary(false);
    new TimelineModal(this, this.collectMediaItems()).open();
  }

  async openMediaFile(path: string): Promise<void> {
    await this.app.workspace.openLinkText(path, "", false);
  }

  getManagedMediaFolder(mediaType: MediaType): string {
    return this.libraryStorage().managedMediaFolder(mediaType);
  }

  getMediaFolder(mediaType: MediaType): string {
    return this.libraryStorage().mediaFolder(mediaType);
  }

  getScanFolders(): string[] {
    return this.libraryStorage().scanFolders();
  }

  async initializeLibrary(copyTemplates = false): Promise<void> {
    await this.libraryStorage().initialize(copyTemplates);
  }

  resolveMediaCoverFile(value: unknown, sourcePath: string): TFile | null {
    return this.repository().resolveCoverFile(value, sourcePath);
  }

  resolveMediaCoverPath(value: unknown, sourcePath: string): string {
    return this.repository().resolveCoverPath(value, sourcePath);
  }

  collectMediaItems(source?: string): MediaItem[] {
    const roots = source
      ? [normalizePath(source).replace(/^\/+|\/+$/g, "")]
      : this.getScanFolders();
    return this.repository().collect(roots);
  }

  private localCoverFiles(): TFile[] {
    const unique = new Map<string, TFile>();
    for (const note of getScopedMarkdownFiles(this.app, this.getScanFolders())) {
      const frontmatter = this.app.metadataCache.getFileCache(note)?.frontmatter;
      const cover = this.resolveMediaCoverFile(frontmatter?.cover, note.path);
      if (cover) unique.set(cover.path, cover);
    }
    return Array.from(unique.values());
  }

  async optimizeExistingCovers(): Promise<void> {
    const files = this.localCoverFiles();
    if (!files.length) {
      new Notice(uiText("notice.coverOptimizeEmpty"));
      return;
    }
    const cache = this.coverCache;
    if (!cache) throw new Error("Cover cache is not initialized");
    const progress = new Notice(uiText("notice.coverOptimizeProgress", { completed: 0, total: files.length }), 0);
    const result = await cache.optimizeFiles(files, (completed, total) => {
      progress.setMessage(uiText("notice.coverOptimizeProgress", { completed, total }));
    });
    progress.setMessage(uiText("notice.coverOptimizeDone", result));
    window.setTimeout(() => progress.hide(), 5000);
    this.refreshViews();
  }

  async clearCoverCache(): Promise<void> {
    const cache = this.coverCache;
    if (!cache) throw new Error("Cover cache is not initialized");
    const removed = await cache.clear();
    new Notice(uiText("notice.coverCacheCleared", { removed }));
    this.refreshViews();
  }

  async setFavorite(path: string, next: boolean): Promise<void> {
    await this.repository().setFavorite(path, next);
    new Notice(uiText(next ? "notice.favoriteAdded" : "notice.favoriteRemoved"));
    this.refreshViews();
  }

  async deleteMediaFile(file: TFile): Promise<void> {
    await this.app.fileManager.trashFile(file);
    this.refreshViews();
  }

  async getTemplates(mediaType: MediaType): Promise<Array<{ path: string; name: string }>> {
    return this.libraryStorage().templates(mediaType);
  }

  async readTemplate(path: string): Promise<string> {
    return this.libraryStorage().readTemplate(path);
  }

  async searchExternal(
    mediaType: MediaType,
    query: string,
  ): Promise<{ results: ExternalMediaResult[]; warnings: string[] }> {
    return this.externalMediaSearch().search(mediaType, query);
  }

  async searchBangumi(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]> {
    return this.metadataProviderClient().searchBangumi(mediaType, query);
  }

  async searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]> {
    return this.metadataProviderClient().searchAniList(mediaType, query);
  }

  async searchOpenLibrary(query: string): Promise<ExternalMediaResult[]> {
    return this.metadataProviderClient().searchOpenLibrary(query);
  }

  async ensureFolder(path: string): Promise<void> {
    await this.libraryStorage().ensureFolder(path);
  }

  findExistingBySource(provider: string, sourceId: string): TFile | undefined {
    return this.repository().findBySource(this.getScanFolders(), provider, sourceId);
  }

  async uniqueFilePath(folder: string, baseName: string, extension: string): Promise<string> {
    return this.libraryStorage().uniqueFilePath(folder, baseName, extension);
  }

  async downloadCover(result: ExternalMediaResult): Promise<string> {
    return this.mediaNotes().downloadCover(result);
  }

  async createMediaNote(result: ExternalMediaResult, form: MediaNoteForm): Promise<TFile> {
    return this.mediaNotes().create(result, form);
  }

}

export default AnimeListPlugin;

/* eslint-enable @typescript-eslint/no-misused-promises -- End Obsidian callback lint scope. */
