/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-misused-promises -- Boundary adapter between typed Obsidian integration and the runtime-validated legacy UI module. */
import {
  ItemView,
  Notice,
  TFile,
  WorkspaceLeaf,
  normalizePath,
  requestUrl,
} from "obsidian";
import LegacyAnimeListPlugin, {
  AnimeListRenderChild,
  AnimeListUI,
  DetailActionsRenderChild,
  TimelineModal,
  legacyTest,
} from "./legacy";
import { BUILTIN_TEMPLATES, BUILTIN_TEMPLATE_PREFIX, getBuiltInTemplateOptions } from "./builtin-templates";
import { CoverThumbnailCache } from "./cover-cache";
import { AnimeListSettingTab, DEFAULT_SETTINGS } from "./settings";
import { completedRequirementMessage, uiText } from "./ui-text";
import { normalizeMediaStatus, normalizeStatusFilter } from "./media-status";
import {
  MEDIA_STATUS_MIGRATION_VERSION,
  migrateMediaStatusNotes,
} from "./schema-migration";
import { rankSearchResults, searchQueryVariants } from "./search";
import { normalizeTimelineMaxStackDepth } from "./timeline-scale";
import type {
  AnimeListSettings,
  ExternalMediaResult,
  LibrarySection,
  MediaItem,
  MediaNoteForm,
  MediaType,
} from "./types";
import { getScopedMarkdownFiles } from "./vault-scope";
import {
  normalizeProgressValue,
  normalizeReleaseStatus,
  normalizeVolumeLog,
} from "./novel-progress";

const VIEW_TYPE = "animelist-library";
const PLUGIN_VERSION = "1.1.2";
const USER_AGENT = `AnimeList-Obsidian/${PLUGIN_VERSION} (local personal media library)`;
const DISPLAY_NAME = "AnimeList";

const {
  buildMediaMarkdown,
  dedupeSearchResults,
  formatFileModifiedTime,
  normalizeAniListMedia,
  normalizeBangumiSubject,
  normalizeGenres,
  normalizeOpenLibraryBook,
  sanitizePathPart,
} = legacyTest;

function asArray<T = unknown>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : stringValue(value, "Unknown error");
}


function stringArray(value: unknown): string[] {
  return asArray(value).map((entry) => stringValue(entry)).filter(Boolean);
}

function optionalScore(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mediaTypeOf(value: unknown): MediaType | null {
  return value === "anime" || value === "manga" || value === "novel" ? value : null;
}

function slugify(value: unknown, fallback = "media"): string {
  return sanitizePathPart(value, fallback)
    .toLocaleLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || fallback;
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
  settings: AnimeListSettings = structuredClone(DEFAULT_SETTINGS);
  private saveUiTimer: number | null = null;
  private coverCache!: CoverThumbnailCache;

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.migrateMediaStatuses();
    this.coverCache = new CoverThumbnailCache(this.app, this.manifest.id);
    await this.coverCache.initialize();
    this.coverCache.scheduleCleanup();
    this.register(() => this.coverCache.dispose());

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

  async loadSettings(): Promise<void> {
    const raw = await this.loadData();
    const loaded = isRecord(raw) ? raw : {};
    const providers = isRecord(loaded.providers) ? loaded.providers : {};
    const migrations = isRecord(loaded.migrations) ? loaded.migrations : {};
    const uiState = isRecord(loaded.uiState) ? loaded.uiState : {};
    this.settings = {
      storageMode: loaded.storageMode === "flat" ? "flat" : "managed",
      libraryRoot: typeof loaded.libraryRoot === "string" ? loaded.libraryRoot : DEFAULT_SETTINGS.libraryRoot,
      flatMediaFolder: typeof loaded.flatMediaFolder === "string" ? loaded.flatMediaFolder : DEFAULT_SETTINGS.flatMediaFolder,
      additionalScanFolders: Array.isArray(loaded.additionalScanFolders)
        ? loaded.additionalScanFolders.filter((folder): folder is string => typeof folder === "string")
        : [],
      coverFolder: typeof loaded.coverFolder === "string" ? loaded.coverFolder : DEFAULT_SETTINGS.coverFolder,
      templateFolder: typeof loaded.templateFolder === "string" ? loaded.templateFolder : DEFAULT_SETTINGS.templateFolder,
      timelineMaxStackDepth: normalizeTimelineMaxStackDepth(
        loaded.timelineMaxStackDepth,
      ),
      googleBooksApiKey: typeof loaded.googleBooksApiKey === "string" ? loaded.googleBooksApiKey.trim() : "",
      providers: {
        bangumi: typeof providers.bangumi === "boolean" ? providers.bangumi : DEFAULT_SETTINGS.providers.bangumi,
        anilist: typeof providers.anilist === "boolean" ? providers.anilist : DEFAULT_SETTINGS.providers.anilist,
        openlibrary: typeof providers.openlibrary === "boolean" ? providers.openlibrary : DEFAULT_SETTINGS.providers.openlibrary,
      },
      migrations: {
        mediaStatus: typeof migrations.mediaStatus === "number" ? migrations.mediaStatus : 0,
      },
      uiState: {
        section: uiState.section === "timeline" ? "timeline" : "library",
        type: uiState.type === "anime" || uiState.type === "manga" || uiState.type === "novel" ? uiState.type : "all",
        status: normalizeStatusFilter(uiState.status),
        genre: typeof uiState.genre === "string" ? uiState.genre : DEFAULT_SETTINGS.uiState.genre,
        sort: typeof uiState.sort === "string" ? uiState.sort : DEFAULT_SETTINGS.uiState.sort,
        view: uiState.view === "list" || uiState.view === "poster" ? uiState.view : "grid",
      },
    };
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
    await this.saveData(this.settings);
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
    const folderName = mediaType === "anime" ? "Anime" : mediaType === "manga" ? "Manga" : "Novel";
    return normalizePath(`${this.settings.libraryRoot}/${folderName}`).replace(/^\/+|\/+$/g, "");
  }

  getMediaFolder(mediaType: MediaType): string {
    if (this.settings.storageMode === "flat") {
      return normalizePath(this.settings.flatMediaFolder).replace(/^\/+|\/+$/g, "");
    }
    return this.getManagedMediaFolder(mediaType);
  }

  getScanFolders(): string[] {
    const primary = this.settings.storageMode === "flat"
      ? [normalizePath(this.settings.flatMediaFolder).replace(/^\/+|\/+$/g, "")]
      : [normalizePath(this.settings.libraryRoot).replace(/^\/+|\/+$/g, "")];
    return [...new Set([
      ...primary,
      ...this.settings.additionalScanFolders.map((folder) => normalizePath(folder).replace(/^\/+|\/+$/g, "")),
    ])];
  }

  async initializeLibrary(copyTemplates = false): Promise<void> {
    if (this.settings.storageMode === "managed") {
      await this.ensureFolder(this.settings.libraryRoot);
      for (const mediaType of ["anime", "manga", "novel"] as MediaType[]) {
        await this.ensureFolder(this.getManagedMediaFolder(mediaType));
      }
    } else if (this.settings.flatMediaFolder) {
      await this.ensureFolder(this.settings.flatMediaFolder);
    }
    await this.ensureFolder(this.settings.coverFolder);
    await this.ensureFolder(this.settings.templateFolder);
    if (copyTemplates) await this.copyBuiltInTemplates();
  }

  private async copyBuiltInTemplates(): Promise<void> {
    const files: Array<[string, string]> = [
      ["Common/簡潔筆記.md", BUILTIN_TEMPLATES["builtin:plain"]],
    ];
    for (const [relativePath, content] of files) {
      const path = normalizePath(`${this.settings.templateFolder}/${relativePath}`);
      const parent = path.split("/").slice(0, -1).join("/");
      if (parent) await this.ensureFolder(parent);
      if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.create(path, content);
    }
  }

  private normalizedCoverPath(value: unknown): string {
    return stringValue(value)
      .replace(/^!\[\[/, "")
      .replace(/^\[\[/, "")
      .replace(/\]\]$/, "")
      .split("|")[0];
  }

  resolveMediaCoverFile(value: unknown, sourcePath: string): TFile | null {
    const coverPath = this.normalizedCoverPath(value);
    if (!coverPath || /^https?:\/\//i.test(coverPath)) return null;
    const coverFile = this.app.metadataCache.getFirstLinkpathDest(coverPath, sourcePath)
      ?? this.app.vault.getAbstractFileByPath(coverPath);
    return coverFile instanceof TFile ? coverFile : null;
  }

  resolveMediaCoverPath(value: unknown, sourcePath: string): string {
    const coverPath = this.normalizedCoverPath(value);
    if (/^https?:\/\//i.test(coverPath)) return coverPath;
    const coverFile = this.resolveMediaCoverFile(value, sourcePath);
    return coverFile ? this.app.vault.getResourcePath(coverFile) : "";
  }

  collectMediaItems(source?: string): MediaItem[] {
    const roots = source
      ? [normalizePath(source).replace(/^\/+|\/+$/g, "")]
      : this.getScanFolders();

    return getScopedMarkdownFiles(this.app, roots)
      .map((file): MediaItem | null => {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!frontmatter?.media_type) return null;

        const coverFile = this.resolveMediaCoverFile(frontmatter.cover, file.path);
        const cover = this.resolveMediaCoverPath(frontmatter.cover, file.path);
        const coverSources = coverFile ? this.coverCache.getSources(coverFile) : undefined;

        const studios = stringArray(frontmatter.studios);
        const authors = stringArray(frontmatter.authors);
        const people = studios.length ? studios : authors.length ? authors : stringArray(frontmatter.creators);

        const mediaType = mediaTypeOf(frontmatter.media_type);
        if (!mediaType) return null;

        return {
          title: stringValue(frontmatter.title, file.basename),
          originalTitle: stringValue(frontmatter.title_original, stringValue(frontmatter.title_romaji)),
          mediaType,
          format: stringValue(frontmatter.format, stringValue(frontmatter.media_type)),
          status: normalizeMediaStatus(frontmatter.status),
          releaseStatus: normalizeReleaseStatus(frontmatter.release_status),
          progress: normalizeProgressValue(frontmatter.progress),
          total: mediaType === "anime" ? normalizeProgressValue(frontmatter.progress_total) : 0,
          unit: stringValue(frontmatter.progress_unit),
          score: optionalScore(frontmatter.score),
          favorite: frontmatter.favorite === true,
          year: typeof frontmatter.year === "number" || typeof frontmatter.year === "string" ? frontmatter.year : "",
          genres: normalizeGenres(frontmatter.genres),
          people,
          platforms: stringArray(frontmatter.platforms),
          sourceUrls: stringArray(frontmatter.source_urls),
          cover,
          coverSources,
          filePath: file.path,
          updated: file.stat.mtime,
          updatedLabel: uiText("library.updatedAt", { date: formatFileModifiedTime(file.stat.mtime) }),
          startedAt: stringValue(frontmatter.started_at),
          completedAt: stringValue(frontmatter.completed_at),
          volumeLog: normalizeVolumeLog(frontmatter.volume_log),
        };
      })
      .filter((item): item is MediaItem => item !== null);
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
    const progress = new Notice(uiText("notice.coverOptimizeProgress", { completed: 0, total: files.length }), 0);
    const result = await this.coverCache.optimizeFiles(files, (completed, total) => {
      progress.setMessage(uiText("notice.coverOptimizeProgress", { completed, total }));
    });
    progress.setMessage(uiText("notice.coverOptimizeDone", result));
    window.setTimeout(() => progress.hide(), 5000);
    this.refreshViews();
  }

  async clearCoverCache(): Promise<void> {
    const removed = await this.coverCache.clear();
    new Notice(uiText("notice.coverCacheCleared", { removed }));
    this.refreshViews();
  }

  async setFavorite(path: string, next: boolean): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(uiText("validation.mediaNoteMissing"));
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.favorite = next;
      delete frontmatter.updated_at;
      delete frontmatter.metadata_updated_at;
    });
    new Notice(uiText(next ? "notice.favoriteAdded" : "notice.favoriteRemoved"));
    this.refreshViews();
  }

  async deleteMediaFile(file: TFile): Promise<void> {
    await this.app.fileManager.trashFile(file);
    this.refreshViews();
  }

  async getTemplates(mediaType: MediaType): Promise<Array<{ path: string; name: string }>> {
    const typeFolder = mediaType === "anime" ? "Anime" : mediaType === "manga" ? "Manga" : "Novel";
    const root = normalizePath(this.settings.templateFolder).replace(/^\/+|\/+$/g, "");
    const custom = getScopedMarkdownFiles(this.app, [root])
      .filter((file) => {
        if (!root || !file.path.startsWith(`${root}/`)) return false;
        const relative = file.path.slice(root.length + 1);
        return !relative.includes("/") || relative.startsWith("Common/") || relative.startsWith(`${typeFolder}/`);
      })
      .sort((a, b) => a.path.localeCompare(b.path, "zh-Hant"))
      .map((file) => ({
        path: file.path,
        name: file.path.startsWith(`${root}/Common/`) ? uiText("common.sharedName", { name: file.basename }) : file.basename,
      }));
    return [...getBuiltInTemplateOptions(mediaType), ...custom];
  }

  async readTemplate(path: string): Promise<string> {
    if (!path) return "";
    if (path.startsWith(BUILTIN_TEMPLATE_PREFIX)) return BUILTIN_TEMPLATES[path] ?? "";
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return "";
    return this.app.vault.cachedRead(file);
  }

  async searchExternal(mediaType: MediaType, query: string): Promise<{ results: ExternalMediaResult[]; warnings: string[] }> {
    const tasks: Array<Promise<{ provider: string; items?: unknown[]; error?: unknown }>> = [];
    const queries = searchQueryVariants(query);
    if (this.settings.providers.bangumi) {
      tasks.push(Promise.all(queries.map((candidate) => this.searchBangumi(mediaType, candidate)))
        .then((groups) => ({ provider: "Bangumi", items: dedupeSearchResults(groups.flat()) }))
        .catch((error) => ({ provider: "Bangumi", error })));
    }
    if (this.settings.providers.anilist) {
      tasks.push(Promise.all(queries.map((candidate) => this.searchAniList(mediaType, candidate)))
        .then((groups) => ({ provider: "AniList", items: dedupeSearchResults(groups.flat()) }))
        .catch((error) => ({ provider: "AniList", error })));
    }
    if (mediaType === "novel" && this.settings.providers.openlibrary) {
      tasks.push(Promise.all(queries.map((candidate) => this.searchOpenLibrary(candidate)))
        .then((groups) => ({ provider: "Open Library", items: dedupeSearchResults(groups.flat()) }))
        .catch((error) => ({ provider: "Open Library", error })));
    }
    if (!tasks.length) return { results: [], warnings: ["No metadata provider is enabled."] };

    const settled = await Promise.all(tasks);
    const warnings = settled
      .filter((entry) => entry.error)
      .map((entry) => `${entry.provider}: ${errorMessage(entry.error)}`);
    const results = settled.flatMap((entry) => entry.items ?? []);
    const deduped: ExternalMediaResult[] = dedupeSearchResults(results);
    return { results: rankSearchResults(deduped, query).slice(0, 24), warnings };
  }

  async searchBangumi(mediaType: MediaType, query: string) {
    const response = await requestUrl({
      url: "https://api.bgm.tv/v0/search/subjects?limit=20&offset=0",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        keyword: query,
        sort: "match",
        filter: { type: [mediaType === "anime" ? 2 : 1], nsfw: false },
      }),
    });
    const payload = response.json ?? JSON.parse(response.text || "{}");
    return asArray(payload.data).map((subject) => normalizeBangumiSubject(subject, mediaType));
  }

  async searchAniList(mediaType: MediaType, query: string) {
    const graphQuery = `
      query ($search: String, $type: MediaType, $format: MediaFormat) {
        Page(page: 1, perPage: 20) {
          media(search: $search, type: $type, format: $format, sort: SEARCH_MATCH) {
            id siteUrl type format status episodes chapters volumes averageScore description(asHtml: false) genres synonyms
            startDate { year month day }
            title { romaji english native }
            coverImage { extraLarge large medium }
            studios(isMain: true) { nodes { name } }
            staff(perPage: 10, sort: RELEVANCE) { edges { role node { name { full native } } } }
          }
        }
      }`;
    const variables = {
      search: query,
      type: mediaType === "anime" ? "ANIME" : "MANGA",
      format: mediaType === "novel" ? "NOVEL" : null,
    };
    const response = await requestUrl({
      url: "https://graphql.anilist.co",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ query: graphQuery, variables }),
    });
    const payload = response.json ?? JSON.parse(response.text || "{}");
    let media = asArray(payload?.data?.Page?.media);
    if (mediaType === "manga") {
      media = media.filter((item: unknown) => !isRecord(item) || stringValue(item.format).toUpperCase() !== "NOVEL");
    }
    return media.map((item) => normalizeAniListMedia(item, mediaType));
  }

  async searchOpenLibrary(query: string) {
    const fields = "key,title,author_name,first_publish_year,cover_i,subject";
    const response = await requestUrl({
      url: `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&limit=8&lang=zh`,
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    const payload = response.json ?? JSON.parse(response.text || "{}");
    return asArray(payload.docs).map(normalizeOpenLibraryBook);
  }

  async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path).replace(/^\/+|\/+$/g, "");
    if (!normalized) return;
    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        try {
          await this.app.vault.createFolder(current);
        } catch (error) {
          if (!this.app.vault.getAbstractFileByPath(current)) throw error;
        }
      }
    }
  }

  findExistingBySource(provider: string, sourceId: string): TFile | undefined {
    return getScopedMarkdownFiles(this.app, this.getScanFolders()).find((file) => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      return frontmatter
        && stringValue(frontmatter.source_provider) === provider
        && stringValue(frontmatter.source_id) === sourceId;
    });
  }

  async uniqueFilePath(folder: string, baseName: string, extension: string): Promise<string> {
    const clean = sanitizePathPart(baseName);
    let candidate = normalizePath(folder ? `${folder}/${clean}.${extension}` : `${clean}.${extension}`);
    let index = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = normalizePath(folder ? `${folder}/${clean} (${index}).${extension}` : `${clean} (${index}).${extension}`);
      index += 1;
    }
    return candidate;
  }

  async downloadCover(result: ExternalMediaResult): Promise<string> {
    if (!result.coverUrl) return "";
    const response = await requestUrl({
      url: result.coverUrl,
      method: "GET",
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,*/*",
        "User-Agent": USER_AGENT,
      },
    });
    const contentType = Object.entries(response.headers ?? {})
      .find(([key]) => key.toLocaleLowerCase() === "content-type")?.[1] ?? "";
    const extension = /webp/i.test(String(contentType))
      ? "webp"
      : /png/i.test(String(contentType))
        ? "png"
        : /avif/i.test(String(contentType))
          ? "avif"
          : "jpg";
    const folder = normalizePath(`${this.settings.coverFolder}/${result.mediaType}`);
    await this.ensureFolder(folder);
    const filename = `${slugify(result.title)}-${result.provider}-${result.sourceId || Date.now()}`;
    const path = await this.uniqueFilePath(folder, filename, extension);
    const file = await this.app.vault.createBinary(path, response.arrayBuffer);
    try {
      await this.coverCache.optimizeFile(file);
    } catch (error) {
      console.warn("AnimeList cover thumbnail generation failed", error);
    }
    return path;
  }

  async createMediaNote(result: ExternalMediaResult, form: MediaNoteForm): Promise<TFile> {
    const title = String(form?.title ?? "").trim();
    const hasScore = form?.score !== "" && form?.score != null;
    const score = hasScore ? Number(form.score) : null;
    const completedAt = String(form?.completedAt ?? "").trim();
    if (!title) throw new Error(uiText("validation.titleRequired"));
    if (form.status === "completed" && !hasScore) throw new Error(completedRequirementMessage(result.mediaType, uiText("field.score")));
    if (hasScore && (score == null || !Number.isFinite(score) || score < 0 || score > 10)) {
      throw new Error(uiText("validation.scoreRange"));
    }
    if (form.status === "completed" && !completedAt) throw new Error(completedRequirementMessage(result.mediaType, uiText("field.completedAt")));

    const existing = this.findExistingBySource(result.provider, String(result.sourceId));
    if (existing) {
      new Notice(uiText("notice.existingSource"));
      await this.openMediaFile(existing.path);
      return existing;
    }

    let coverPath = "";
    if (result.coverUrl) {
      try {
        coverPath = await this.downloadCover(result);
      } catch (error) {
        console.warn("AnimeList cover download failed; using the remote URL.", error);
        new Notice(uiText("notice.coverRemote"));
      }
    }

    const folder = this.getMediaFolder(result.mediaType);
    if (folder) await this.ensureFolder(folder);
    const path = await this.uniqueFilePath(folder, form.title || result.title, "md");
    const templateContent = await this.readTemplate(form.templatePath);
    const preparedForm: MediaNoteForm = {
      ...form,
      status: normalizeMediaStatus(form.status),
      volumeLog: result.mediaType === "novel"
        ? normalizeVolumeLog(form.volumeLog)
        : [],
    };
    const markdown = buildMediaMarkdown(result, preparedForm, coverPath, templateContent);
    const file = await this.app.vault.create(path, markdown);
    this.refreshViews();
    return file;
  }
}

export default AnimeListPlugin;

/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-misused-promises -- End typed legacy-adapter lint scope. */
