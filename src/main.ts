import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { AnimeListApplicationServices } from "./app/anime-list-application";
import { AnimeListFeatureRegistry } from "./app/feature-registry";
import type { AnimeListFeature, AnimeListFeatureHost } from "./app/feature-types";
import { createReliableLibraryOpener } from "./library-navigation";
import { AnimeListSettingTab } from "./settings";
import { createDefaultSettings } from "./settings-model";
import { AnimeListSettingsStore } from "./settings-store";
import { searchFeatureText } from "./search-feature-text";
import { loadMissingSerialCovers, type SerialCoverMigrationProgress, type SerialCoverMigrationSummary } from "./serial-cover-service";
import { MEDIA_STATUS_MIGRATION_VERSION, migrateMediaStatusNotes } from "./schema-migration";
import type { AnimeListSettings, ExternalMediaResult, ExternalMediaSearchPage, MediaItem, MediaNoteForm, MediaType } from "./types";
import { uiText } from "./ui-text";
import { AnimeListUI } from "./ui/library-renderer";
import type { LibraryRenderAdapters, LibraryViewMode } from "./ui/library-contracts";
import { AnimeListView, ANIMELIST_VIEW_TYPE } from "./ui/library-view";
import { parseAnimeListBlockConfig } from "./ui/markdown-config";
import { AnimeListRenderChild, DetailActionsRenderChild } from "./ui/markdown-renderers";
import type { MediaFormContext, MediaFormSubmitContext } from "./ui/media-form-contracts";
import { AddMediaModal, EditMediaModal } from "./ui/media-modals";
import type { AnimeListUiHost } from "./ui/plugin-host";
import type { SearchModalAdapter } from "./ui/search-contracts";
import { TimelineModal } from "./ui/timeline-modal";

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : typeof value === "string" ? value : "Unknown error";
}

export class AnimeListPlugin extends Plugin implements AnimeListUiHost {
  settings: AnimeListSettings = createDefaultSettings();
  readonly libraryViewModes = new Map<string, LibraryViewMode>();

  private readonly features = new AnimeListFeatureRegistry<AnimeListFeatureHost>();
  private application?: AnimeListApplicationServices;
  private saveUiTimer: number | null = null;
  private libraryOpener?: () => Promise<void>;

  protected featureManifest(): readonly AnimeListFeature<AnimeListFeatureHost>[] { return []; }

  async onload(): Promise<void> {
    this.features.load(this.featureManifest());
    await this.loadSettings();
    await this.services().initialize();
    this.register(() => this.services().dispose());
    await this.migrateMediaStatuses();
    await this.features.activate(this);

    this.registerView(ANIMELIST_VIEW_TYPE, (leaf) => new AnimeListView(leaf, this));
    this.addRibbonIcon("library", uiText("app.openLibrary"), () => void this.openLibrary());
    this.registerMarkdownRenderers();
    this.registerCommands();
    this.addSettingTab(new AnimeListSettingTab(this.app, this));

    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      if (file instanceof TFile && this.services().handleLibraryMetadataChange(file)) this.refreshViews();
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file instanceof TAbstractFile
        && this.services().handleLibraryDelete(file.path, file instanceof TFile)) this.refreshViews();
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const nextPath = file instanceof TAbstractFile ? file.path : "";
      const previousPath = typeof oldPath === "string" ? oldPath : "";
      if (this.services().handleLibraryRename(file instanceof TFile ? file : null, previousPath, nextPath)) {
        this.refreshViews();
      }
    }));
  }

  private registerMarkdownRenderers(): void {
    this.registerMarkdownCodeBlockProcessor("animelist", (source, element, context) => {
      context.addChild(new AnimeListRenderChild(element, this, context.sourcePath, parseAnimeListBlockConfig(source)));
    });
    this.registerMarkdownCodeBlockProcessor("animelist-detail", (_source, element, context) => {
      context.addChild(new DetailActionsRenderChild(element, this, context.sourcePath));
    });
  }

  private registerCommands(): void {
    this.addCommand({ id: "open-library", name: uiText("app.openLibrary"), callback: () => void this.openLibrary() });
    this.addCommand({ id: "add-media", name: uiText("action.collect"), callback: () => this.openAddModal("anime") });
    this.addCommand({ id: "open-timeline", name: uiText("app.openTimeline"), callback: () => void this.openTimeline() });
    this.addCommand({ id: "initialize-library", name: uiText("app.initializeLibrary"), callback: () => void this.initializeLibrary(false) });
    this.addCommand({ id: "optimize-cover-thumbnails", name: uiText("app.optimizeCovers"), callback: () => void this.optimizeExistingCovers() });
    this.addCommand({ id: "clear-cover-thumbnail-cache", name: uiText("app.clearCoverCache"), callback: () => void this.clearCoverCache() });
  }

  private services(): AnimeListApplicationServices {
    this.application ??= new AnimeListApplicationServices(
      this.app,
      this.manifest?.id ?? "animelist",
      () => this.settings,
      {
        openMediaFile: (path) => this.openMediaFile(path),
        refreshViews: () => this.refreshViews(),
      },
    );
    return this.application;
  }

  private settingsStore(): AnimeListSettingsStore { return new AnimeListSettingsStore(this); }
  async loadSettings(): Promise<void> { this.settings = await this.settingsStore().load(); }
  async saveSettings(): Promise<void> { this.settings = await this.settingsStore().save(this.settings); }

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
    this.app.workspace.getLeavesOfType(ANIMELIST_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof AnimeListView) leaf.view.scheduleRender();
    });
  }

  renderLibrary(container: HTMLElement, items: MediaItem[], adapters: LibraryRenderAdapters = {}): void {
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
      findLeaves: () => this.app.workspace.getLeavesOfType(ANIMELIST_VIEW_TYPE),
      createLeaf: () => this.app.workspace.getLeaf("tab"),
      activateLeaf: (leaf) => leaf.setViewState({ type: ANIMELIST_VIEW_TYPE, active: true }),
      revealLeaf: (leaf) => this.app.workspace.revealLeaf(leaf),
      showLibrary: async (leaf) => {
        if (!(leaf.view instanceof AnimeListView)) throw new Error("The AnimeList library view was not available after activation.");
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

  async openLibrary(): Promise<void> { await this.reliableLibraryOpener()(); }
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

  getManagedMediaFolder(mediaType: MediaType): string { return this.services().getManagedMediaFolder(mediaType); }
  getMediaFolder(mediaType: MediaType): string { return this.services().getMediaFolder(mediaType); }
  getScanFolders(): string[] { return this.services().getScanFolders(); }
  async initializeLibrary(copyTemplates = false): Promise<void> { await this.services().initializeLibrary(copyTemplates); }
  resolveMediaCoverFile(value: unknown, sourcePath: string): TFile | null { return this.services().resolveMediaCoverFile(value, sourcePath); }
  resolveMediaCoverPath(value: unknown, sourcePath: string): string { return this.services().resolveMediaCoverPath(value, sourcePath); }

  collectMediaItems(source?: string): MediaItem[] {
    return this.features.decorateMediaItems(this.services().collectMediaItems(source), this);
  }

  async optimizeExistingCovers(): Promise<void> {
    const files = this.services().localCoverFiles();
    if (!files.length) { new Notice(uiText("notice.coverOptimizeEmpty")); return; }
    const progress = new Notice(uiText("notice.coverOptimizeProgress", { completed: 0, total: files.length }), 0);
    const result = await this.services().optimizeCovers(files, (completed, total) => {
      progress.setMessage(uiText("notice.coverOptimizeProgress", { completed, total }));
    });
    progress.setMessage(uiText("notice.coverOptimizeDone", result));
    window.setTimeout(() => progress.hide(), 5000);
    this.refreshViews();
  }

  async clearCoverCache(): Promise<void> {
    const removed = await this.services().clearCoverCache();
    new Notice(uiText("notice.coverCacheCleared", { removed }));
    this.refreshViews();
  }

  async setFavoriteDirect(path: string, next: boolean): Promise<void> {
    await this.services().setFavorite(path, next);
    new Notice(uiText(next ? "notice.favoriteAdded" : "notice.favoriteRemoved"));
  }

  async updateSpecialLabelState(path: string, favorite: boolean, labels: string[]): Promise<void> {
    await this.services().updateSpecialLabelState(path, favorite, labels);
  }

  async setFavorite(path: string, next: boolean): Promise<void> {
    if (await this.features.handleFavorite({ host: this, path, next })) return;
    await this.setFavoriteDirect(path, next);
  }

  async deleteMediaFile(file: TFile): Promise<void> { await this.services().deleteMediaFile(file); this.refreshViews(); }
  async getTemplates(mediaType: MediaType): Promise<Array<{ path: string; name: string }>> { return this.services().getTemplates(mediaType); }
  async readTemplate(path: string): Promise<string> { return this.services().readTemplate(path); }
  async searchExternal(mediaType: MediaType, query: string): Promise<{ results: ExternalMediaResult[]; warnings: string[] }> { return this.services().searchExternal(mediaType, query); }
  async searchExternalPage(mediaType: MediaType, query: string, page: number): Promise<ExternalMediaSearchPage> { return this.services().searchExternalPage(mediaType, query, page); }
  async searchBangumi(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]> { return this.services().searchBangumi(mediaType, query); }
  async searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]> { return this.services().searchAniList(mediaType, query); }
  async searchOpenLibrary(query: string): Promise<ExternalMediaResult[]> { return this.services().searchOpenLibrary(query); }
  async ensureFolder(path: string): Promise<void> { await this.services().ensureFolder(path); }
  findExistingBySource(provider: string, sourceId: string): TFile | undefined { return this.services().findExistingBySource(provider, sourceId); }
  async uniqueFilePath(folder: string, baseName: string, extension: string): Promise<string> { return this.services().uniqueFilePath(folder, baseName, extension); }
  async downloadCover(result: ExternalMediaResult): Promise<string> { return this.services().downloadCover(result); }
  async createMediaNote(result: ExternalMediaResult, form: MediaNoteForm): Promise<TFile> { return this.services().createMediaNote(result, form); }
  async updateMediaNote(file: TFile, mediaType: MediaType, form: MediaNoteForm): Promise<void> { await this.services().updateMediaNote(file, mediaType, form); }

  getFeatureSettingsSections(): ReturnType<AnimeListFeatureRegistry<AnimeListFeatureHost>["settingsSections"]> { return this.features.settingsSections(this); }
  afterSearchRender(modal: SearchModalAdapter): void { this.features.afterSearchRender({ host: this, modal }); }
  configureMediaForm(context: MediaFormContext<AnimeListUiHost>): void { this.features.configureMediaForm({ ...context, host: this }); }
  async prepareMediaSubmit(context: MediaFormSubmitContext<AnimeListUiHost>): Promise<void> { await this.features.prepareMediaSubmit({ ...context, host: this }); }
  afterDetailRender(container: HTMLElement, sourcePath: string, frontmatter: Record<string, unknown>): void { this.features.afterDetailRender({ host: this, container, sourcePath, frontmatter }); }

  async loadMissingSerialCovers(
    onProgress?: (progress: SerialCoverMigrationProgress) => void,
    signal?: AbortSignal,
  ): Promise<SerialCoverMigrationSummary> {
    return loadMissingSerialCovers(this, onProgress, signal);
  }
}

export default AnimeListPlugin;
