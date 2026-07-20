/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-misused-promises -- Boundary adapter between typed Obsidian integration and the runtime-validated legacy UI module. */
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
import { AnimeListSettingTab, DEFAULT_SETTINGS } from "./settings";
import type { AnimeListSettings, LibrarySection, MediaType } from "./types";
import { getScopedMarkdownFiles } from "./vault-scope";

const VIEW_TYPE = "animelist-library";
const PLUGIN_VERSION = "1.0.2";
const USER_AGENT = `AnimeList-Obsidian/${PLUGIN_VERSION} (local personal media library)`;

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
    return "AnimeList";
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

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new AnimeListView(leaf, this));
    this.addRibbonIcon("library", "開啟 AnimeList", () => void this.openLibrary());

    this.registerMarkdownCodeBlockProcessor("animelist", (source, element, context) => {
      const child = new AnimeListRenderChild(element, this, context.sourcePath, this.parseLegacyConfig(source));
      context.addChild(child);
    });
    this.registerMarkdownCodeBlockProcessor("animelist-detail", (_source, element, context) => {
      const child = new DetailActionsRenderChild(element, this, context.sourcePath);
      context.addChild(child);
    });

    this.addCommand({ id: "open-library", name: "Open library", callback: () => void this.openLibrary() });
    this.addCommand({ id: "add-media", name: "Search and add media", callback: () => this.openAddModal("anime") });
    this.addCommand({ id: "open-timeline", name: "開啟時間軸", callback: () => void this.openTimeline() });
    this.addCommand({ id: "initialize-library", name: "Create library folders", callback: () => void this.initializeLibrary(false) });
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
    const loaded = (await this.loadData()) ?? {};
    this.settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      ...loaded,
      providers: { ...DEFAULT_SETTINGS.providers, ...(loaded.providers ?? {}) },
      uiState: { ...DEFAULT_SETTINGS.uiState, ...(loaded.uiState ?? {}) },
      additionalScanFolders: Array.isArray(loaded.additionalScanFolders) ? loaded.additionalScanFolders : [],
    };
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

  collectMediaItems(source?: string): any[] {
    const roots = source
      ? [normalizePath(source).replace(/^\/+|\/+$/g, "")]
      : this.getScanFolders();

    return getScopedMarkdownFiles(this.app, roots)
      .map((file) => {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!frontmatter?.media_type) return null;

        const coverPath = String(frontmatter.cover ?? "")
          .replace(/^!\[\[/, "")
          .replace(/^\[\[/, "")
          .replace(/\]\]$/, "")
          .split("|")[0];
        let cover = "";
        if (/^https?:\/\//i.test(coverPath)) {
          cover = coverPath;
        } else if (coverPath) {
          const coverFile = this.app.metadataCache.getFirstLinkpathDest(coverPath, file.path)
            ?? this.app.vault.getAbstractFileByPath(coverPath);
          if (coverFile instanceof TFile) cover = this.app.vault.getResourcePath(coverFile);
        }

        const people = asArray(frontmatter.studios).length
          ? asArray(frontmatter.studios)
          : asArray(frontmatter.authors).length
            ? asArray(frontmatter.authors)
            : asArray(frontmatter.creators);

        return {
          title: String(frontmatter.title ?? file.basename),
          originalTitle: String(frontmatter.title_original ?? frontmatter.title_romaji ?? ""),
          mediaType: String(frontmatter.media_type),
          format: String(frontmatter.format ?? frontmatter.media_type),
          status: String(frontmatter.status ?? "planned"),
          progress: frontmatter.progress ?? 0,
          total: frontmatter.progress_total ?? 0,
          unit: String(frontmatter.progress_unit ?? ""),
          score: frontmatter.score,
          favorite: frontmatter.favorite === true,
          year: frontmatter.year ?? "",
          genres: normalizeGenres(frontmatter.genres),
          people,
          platforms: asArray(frontmatter.platforms),
          sourceUrls: asArray(frontmatter.source_urls),
          cover,
          filePath: file.path,
          updated: file.stat.mtime,
          updatedLabel: `更新於 ${formatFileModifiedTime(file.stat.mtime)}`,
          startedAt: frontmatter.started_at ?? "",
          completedAt: frontmatter.completed_at ?? "",
        };
      })
      .filter(Boolean);
  }

  async setFavorite(path: string, next: boolean): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error("Media note not found");
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.favorite = next;
      delete frontmatter.updated_at;
      delete frontmatter.metadata_updated_at;
    });
    new Notice(next ? "已收進最愛。" : "已從最愛中移除。");
    this.refreshViews();
  }

  async deleteMediaFile(file: TFile): Promise<void> {
    if (this.app.fileManager.trashFile) await this.app.fileManager.trashFile(file);
    else await this.app.vault.trash(file, true);
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
        name: file.path.startsWith(`${root}/Common/`) ? `${file.basename}（共用）` : file.basename,
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

  async searchExternal(mediaType: MediaType, query: string): Promise<{ results: unknown[]; warnings: string[] }> {
    const tasks: Array<Promise<{ provider: string; items?: unknown[]; error?: unknown }>> = [];
    if (this.settings.providers.bangumi) {
      tasks.push(this.searchBangumi(mediaType, query)
        .then((items) => ({ provider: "Bangumi", items }))
        .catch((error) => ({ provider: "Bangumi", error })));
    }
    if (this.settings.providers.anilist) {
      tasks.push(this.searchAniList(mediaType, query)
        .then((items) => ({ provider: "AniList", items }))
        .catch((error) => ({ provider: "AniList", error })));
    }
    if (mediaType === "novel" && this.settings.providers.openlibrary) {
      tasks.push(this.searchOpenLibrary(query)
        .then((items) => ({ provider: "Open Library", items }))
        .catch((error) => ({ provider: "Open Library", error })));
    }
    if (!tasks.length) return { results: [], warnings: ["No metadata provider is enabled."] };

    const settled = await Promise.all(tasks);
    const warnings = settled
      .filter((entry) => entry.error)
      .map((entry) => `${entry.provider}: ${entry.error instanceof Error ? entry.error.message : String(entry.error)}`);
    const results = settled.flatMap((entry) => entry.items ?? []);
    return { results: dedupeSearchResults(results).slice(0, 24), warnings };
  }

  async searchBangumi(mediaType: MediaType, query: string): Promise<any[]> {
    const response = await requestUrl({
      url: "https://api.bgm.tv/v0/search/subjects?limit=10&offset=0",
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

  async searchAniList(mediaType: MediaType, query: string): Promise<any[]> {
    const graphQuery = `
      query ($search: String, $type: MediaType, $format: MediaFormat) {
        Page(page: 1, perPage: 10) {
          media(search: $search, type: $type, format: $format, sort: SEARCH_MATCH) {
            id siteUrl type format episodes chapters volumes averageScore description(asHtml: false) genres synonyms
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
      media = media.filter((item: any) => String(item?.format ?? "").toUpperCase() !== "NOVEL");
    }
    return media.map((item) => normalizeAniListMedia(item, mediaType));
  }

  async searchOpenLibrary(query: string): Promise<any[]> {
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
        && String(frontmatter.source_provider ?? "") === provider
        && String(frontmatter.source_id ?? "") === String(sourceId);
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

  async downloadCover(result: any): Promise<string> {
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
    await this.app.vault.createBinary(path, response.arrayBuffer);
    return path;
  }

  async createMediaNote(result: any, form: any): Promise<TFile> {
    const title = String(form?.title ?? "").trim();
    const score = Number(form?.score);
    const completedAt = String(form?.completedAt ?? "").trim();
    if (!title) throw new Error("Title is required.");
    if (form?.score === "" || form?.score == null || !Number.isFinite(score) || score < 0 || score > 10) {
      throw new Error("Score must be between 0 and 10.");
    }
    if (!completedAt) throw new Error("Completion date is required.");

    const existing = this.findExistingBySource(result.provider, result.sourceId);
    if (existing) {
      new Notice("這筆外部資料已經在收藏庫中，已替你開啟原筆記。");
      await this.openMediaFile(existing.path);
      return existing;
    }

    let coverPath = "";
    if (result.coverUrl) {
      try {
        coverPath = await this.downloadCover(result);
      } catch (error) {
        console.warn("AnimeList cover download failed; using the remote URL.", error);
        new Notice("封面暫時無法存到本機，會先使用遠端圖片。");
      }
    }

    const folder = this.getMediaFolder(result.mediaType);
    if (folder) await this.ensureFolder(folder);
    const path = await this.uniqueFilePath(folder, form.title || result.title, "md");
    const templateContent = await this.readTemplate(form.templatePath);
    const markdown = buildMediaMarkdown(result, form, coverPath, templateContent);
    const file = await this.app.vault.create(path, markdown);
    this.refreshViews();
    return file;
  }
}

export default AnimeListPlugin;
