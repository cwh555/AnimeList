import {
  ItemView,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import { AddMediaModal, EditMediaModal } from "./ui/media-modals";
import { AnimeListRenderChild, DetailActionsRenderChild } from "./ui/markdown-renderers";
import { AnimeListUI } from "./ui/library-renderer";
import { TimelineModal } from "./ui/timeline-modal";
import { AnimeListFeatureRegistry } from "./app/feature-registry";
import { createReliableLibraryOpener } from "./library-navigation";
import type { AnimeListFeature, AnimeListFeatureHost } from "./app/feature-types";
import { CoverThumbnailCache } from "./cover-cache";
import { MediaRepository } from "./data/media-repository";
import {
  ExternalMediaSearchService,
  HttpMetadataProviderClient,
  type MetadataProviderClient,
} from "./data/external-media-service";
import { LibraryStorage } from "./data/library-storage";
import { MediaNoteService } from "./data/media-note-service";
import { MediaUpdateService } from "./data/media-update-service";
import { AnimeListSettingTab } from "./settings";
import { createDefaultSettings } from "./settings-model";
import { AnimeListSettingsStore } from "./settings-store";
import { uiText } from "./ui-text";
import { searchFeatureText } from "./search-feature-text";
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
import type { LibraryRenderAdapters, LibraryViewMode } from "./ui/library-contracts";
import type { MediaFormContext, MediaFormSubmitContext } from "./ui/media-form-contracts";
import type { SearchModalAdapter } from "./ui/search-contracts";
import type { AnimeListUiHost } from "./ui/plugin-host";
import { getScopedMarkdownFiles } from "./vault-scope";
import {
  loadMissingSerialCovers,
  type SerialCoverMigrationProgress,
  type SerialCoverMigrationSummary,
} from "./serial-cover-service";

const VIEW_TYPE = "animelist-library";
const DISPLAY_NAME = "AnimeList";

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : typeof value === "string" ? value : "Unknown error";
}

class AnimeListView extends ItemView {
  private readonly plugin: AnimeListPlugin;
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AnimeListPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return DISPLAY_NAME; }
  getIcon(): string { return "library"; }

  async onOpen(): Promise<void> { await this.render(); }

  scheduleRender(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.render();
    }, 100);
  }

  async showSection(section: LibrarySection): Promise<void> {
    this.plugin.settings.uiState.section = section;
    await this.plugin.saveSettings();
    await this.render();
  }

  private async render(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("animelist-native-view");
    this.plugin.renderLibrary(this.contentEl, this.plugin.collectMediaItems(), {
      initialState: this.plugin.settings.uiState,
      onStateChange: (state) => this.plugin.updateUiState({
        ...this.plugin.settings.uiState,
        ...state,
      } as AnimeListSettings["uiState"]),
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

export class AnimeListPlugin extends Plugin implements AnimeListUiHost {
  settings: AnimeListSettings = createDefaultSettings();
  private readonly features = new AnimeListFeatureRegistry<AnimeListFeatureHost>();
  readonly libraryViewModes = new Map<string, LibraryViewMode>();

  private saveUiTimer: number | null = null;
  private coverCache?: CoverThumbnailCache;
  private mediaRepository?: MediaRepository;
  private storage?: LibraryStorage;
  private providerClient?: MetadataProviderClient;
  private searchService?: ExternalMediaSearchService;
  private noteService?: MediaNoteService;
  private updateService?: MediaUpdateService;
  private libraryOpener?: () => Promise<void>;

  protected featureManifest(): readonly AnimeListFeature<AnimeListFeatureHost>[] { return []; }

  async onload(): Promise<void> {
    this.features.load(this.featureManifest());
    await this.loadSettings();
    await this.migrateMediaStatuses();

    this.coverCache = new CoverThumbnailCache(this.app, this.manifest.id);
    await this.coverCache.initialize();
    this.mediaRepository = new MediaRepository(this.app, (file) => this.coverCache?.getSources(file));
    this.coverCache.scheduleCleanup();
    this.register(() => this.coverCache?.dispose());

    await this.features.activate(this);

    this.registerView(VIEW_TYPE, (leaf) => new AnimeListView(leaf, this));
    this.addRibbonIcon("library", uiText("app.openLibrary"), () => void this.openLibrary());

    this.registerMarkdownCodeBlockProcessor("animelist", (source, element, context) => {
      const child = new AnimeListRenderChild(element, this, context.sourcePath, this.parseBlockConfig(source));
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

  private parseBlockConfig(source: string): Record<string, string> {
    const config: Record<string, string> = {};
    source.split("\n").forEach((line) => {
      index = line.indexOf(":");
      if (index < 0) return;
      config[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    });
    return config;
  }

  private settingsStore(): AnimeListSettingsStore { return new AnimeListSettingsStore(this); }

  private libraryStorage(): LibraryStorage {
    this.storage ??= new LibraryStorage(this.app, () => this.settings);
    return this.storage;
  }

  private repository(): MediaRepository {
    this.mediaRepository ??= new MediaRepository(this.app, (file) => this.coverCache?.getSources(file));
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
      () => this.settings.searchLanguages,
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

  private mediaUpdates(): MediaUpdateService {
    this.updateService ??= new MediaUpdateService(this.app, { refreshViews: () => this.refreshViews() });
    return this.updateService;
  }

  async loadSettings(): Promise<void> { this.settings = await this.settingsStore().load(); }

  private async migrateMediaStatuses(): Promise<void> {
    if (this.settings.migrations.mediaStatus >= MEDIA_STATUS_MIGRATION_VERSION) return;
    try {
      const result = await migrateMediaStatusNotes(this.app, this.getScanFolders());
      this.settings.migrations.mediaStatus = MEDIA_STATUS_MIGRATION_VERSION;
      await this.saveSettings();
      if (result.total > 0) new Notice(uiText("notice.statusMigration", { count: result.total }));
    } catch (error) {
      console.error("AnimeList media-status migration failed", error);
      new Notice(uiText("notice.statusMigrationFailed", { error: errorMessage(error) }));
    }
  }

  async saveSettings(): Promise<void> { this.settings = await this.settingsStore().save(this.settings); }

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

  renderLibrary(container: HTMLElement, rawItems: MediaItem[], adapters: LibraryRenderAdapters = {}): void {
    const items = rawItems;
    let prepared = this.features.prepareLibraryAdapters(this, container, items, adapters);
    const upstreamAfterRender = prepared.afterRender;
    prepared = {
      ...prepared,
      afterRender: (state) => {
        upstreamAfterRender?.(state);
        this.features.afterLibraryRender({ host: this, container, items, adapters: prepared, state });
      },
    };
    AnimeListUI.renderLibrary(container, items, prepared);
  }

  private reliableLibraryOpener(): () => Promise<void> {
    this.libraryOpener ??= createReliableLibraryOpener({
      findLeaves: () => this.app.workspace.getLeavesOfType(VIEW_TYPE),
      createLeaf: () => this.app.workspace.getLeaf("tab"),
      activateLeaf: (leaf) => leaf.setViewState({ type: VIEW_TYPE, active: true }),
      revealLeaf: (leaf) => this.app.workspace.revealLeaf(leaf),
      showLibrary: async (leaf) => {
        if (!(leaf.view instanceof AnimeListView)) {
          throw new Error("The AnimeList library view was not available after activation.");
        }
        await leaf.view.showSection("library");
      },
      initializeLibrary: () => this.initializeLibrary(false),
      reportOpenFailure: (error) => {
        console.error("AnimeList could not open the library", error);
        new Notice(searchFeatureText("library.openFailed", { message: errorMessage(error) }));
      },
      reportSetupFailure: (error) => {
        console.error("AnimeList could not create configured folders", error);
        new Notice(searchFeatureText("library.setupFailed", { message: errorMessage(error) }));
      },
    });
    return this.libraryOpener;
  }

  async openLibrary(): Promise<void> {
    await this.reliableLibraryOpener()();
  }

  openAddModal(initialType: MediaType = "anime"): void { new AddMediaModal(this, initialType).open(); }

  openEditModal(path: string): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(uiText("notice.mediaNoteMissing"));
      return;
    }
    new EditMediaModal(this, file).open();
  }

  async openTimeline(): Promise<void> {
    await this.initializeLibrary(false);
    new TimelineModal(this, this.collectMediaItems()).open();
  }

  async openMediaFile(path: string): Promise<void> { await this.app.workspace.openLinkText(path, "", false); }

  getManagedMediaFolder(mediaType: MediaType): string { return this.libraryStorage().managedMediaFolder(mediaType); }
  getMediaFolder(mediaType: MediaType): string { return this.libraryStorage().mediaFolder(mediaType); }
  getScanFolders(): string[] { return this.libraryStorage().scanFolders(); }
  async initializeLibrary(copyTemplates = false): Promise<void> { await this.libraryStorage().initialize(copyTemplates); }
  resolveMediaCoverFile(value: unknown, sourcePath: string): TFile | null { return this.repository().resolveCoverFile(value, sourcePath); }
  resolveMediaCoverPath(value: unknown, sourcePath: string): string { return this.repository().resolveCoverPath(value, sourcePath); }

  collectMediaItems(source?: string): MediaItem[] {
    const roots = source ? [normalizePath(source).replace(/^\/+|\/+$/g, "")] : this.getScanFolders();
    return this.features.decorateMediaItems(this.repository().collect(roots), this);
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
    if (!files.length) { new Notice(uiText("notice.coverOptimizeEmpty")); return; }
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

  async setFavoriteDirect(path: string, next: boolean): Promise<void> {
    await this.repository().setFavorite(path, next);
    new Notice(uiText(next ? "notice.favoriteAdded" : "notice.favoriteRemoved"));
    this.refreshViews();
  }

  async setFavorite(path: string, next: boolean): Promise<void> {
    if (await this.features.handleFavorite({ host: this, path, next })) return;
    await this.setFavoriteDirect(path, next);
  }

  async deleteMediaFile(file: TFile): Promise<void> {
    await this.app.fileManager.trashFile(file);
    this.refreshViews();
  }

  async getTemplates(mediaType: MediaType): Promise<Array<{ path: string; name: string }>> {
    return this.libraryStorage().templates(mediaType);
  }

  async readTemplate(path: string): Promise<string> { return this.libraryStorage().readTemplate(path); }

  async searchExternal(mediaType: MediaType, query: string): Promise<{ results: ExternalMediaResult[]; warnings: string[] }> {
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

  async ensureFolder(path: string): Promise<void> { await this.libraryStorage().ensureFolder(path); }

  findExistingBySource(provider: string, sourceId: string): TFile | undefined {
    return this.repository().findBySource(this.getScanFolders(), provider, sourceId);
  }

  async uniqueFilePath(folder: string, baseName: string, extension: string): Promise<string> {
    return this.libraryStorage().uniqueFilePath(folder, baseName, extension);
  }

  async downloadCover(result: ExternalMediaResult): Promise<string> { return this.mediaNotes().downloadCover(result); }

  async createMediaNote(result: ExternalMediaResult, form: MediaNoteForm): Promise<TFile> {
    return this.mediaNotes().create(result, form);
  }

  async updateMediaNote(file: TFile, mediaType: MediaType, form: MediaNoteForm): Promise<void> {
    await this.mediaUpdates().update(file, mediaType, form);
  }

  getFeatureSettingsSections(): ReturnType<AnimeListFeatureRegistry<AnimeListFeatureHost>["settingsSections"]> {
    return this.features.settingsSections(this);
  }

  afterSearchRender(modal: SearchModalAdapter): void {
    this.features.afterSearchRender({ host: this, modal });
  }

  configureMediaForm(context: MediaFormContext<AnimeListUiHost>): void {
    this.features.configureMediaForm({ ...context, host: this });
  }

  async prepareMediaSubmit(context: MediaFormSubmitContext<AnimeListUiHost>): Promise<void> {
    await this.features.prepareMediaSubmit({ ...context, host: this });
  }

  afterDetailRender(container: HTMLElement, sourcePath: string, frontmatter: Record<string, unknown>): void {
    this.features.afterDetailRender({ host: this, container, sourcePath, frontmatter });
  }

  async loadMissingSerialCovers(
    onProgress?: (progress: SerialCoverMigrationProgress) => void,
    signal?: AbortSignal,
  ): Promise<SerialCoverMigrationSummary> {
    return loadMissingSerialCovers(this, onProgress, signal);
  }
}

export default AnimeListPlugin;
