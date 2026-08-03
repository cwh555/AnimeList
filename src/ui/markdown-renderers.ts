import { MarkdownRenderChild, TAbstractFile, TFile } from "obsidian";
import type { MediaItem, MediaType } from "../types";
import { normalizeMediaStatus } from "../media-status";
import { normalizeProgressValue, normalizeReleaseStatus, progressDisplayValue } from "../novel-progress";
import { uiText } from "../ui-text";
import type { LibraryViewMode } from "./library-contracts";
import type { AnimeListUiHost } from "./plugin-host";
import { shouldRefreshAnimeListBlockPath, shouldRefreshAnimeListBlockRename } from "./markdown-refresh-scope";
import { ConfirmDeleteModal } from "./media-modals";
import { appendIconLabel, asArray, itemStatusLabel, makeEl, mediaUnitLabel } from "./ui-helpers";

export class AnimeListRenderChild extends MarkdownRenderChild {
  private renderTimer: number | null = null;
  private viewMode: LibraryViewMode;

  constructor(
    containerEl: HTMLElement,
    private readonly plugin: AnimeListUiHost,
    private readonly sourcePath: string,
    private readonly config: Record<string, string>,
  ) {
    super(containerEl);
    this.viewMode = this.plugin.libraryViewModes.get(this.sourcePath) ?? "grid";
  }

  onload(): void {
    this.render();
    const shouldRefresh = (path: string): boolean => shouldRefreshAnimeListBlockPath(
      path, this.config.source, this.plugin.getScanFolders(), this.plugin.settings.coverFolder,
    );
    this.registerEvent(this.plugin.app.metadataCache.on("changed", (file) => {
      if (file instanceof TFile && shouldRefresh(file.path)) this.scheduleRender();
    }));
    this.registerEvent(this.plugin.app.vault.on("create", (file) => {
      if (file instanceof TAbstractFile && shouldRefresh(file.path)) this.scheduleRender();
    }));
    this.registerEvent(this.plugin.app.vault.on("delete", (file) => {
      if (file instanceof TAbstractFile && shouldRefresh(file.path)) this.scheduleRender();
    }));
    this.registerEvent(this.plugin.app.vault.on("rename", (file, oldPath) => {
      const newPath = file instanceof TAbstractFile ? file.path : "";
      const previousPath = typeof oldPath === "string" ? oldPath : "";
      if (shouldRefreshAnimeListBlockRename(
        previousPath, newPath, this.config.source, this.plugin.getScanFolders(), this.plugin.settings.coverFolder,
      )) this.scheduleRender();
    }));
  }

  scheduleRender(): void {
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.render(), 120);
  }

  onunload(): void {
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
  }

  collectItems(): MediaItem[] {
    return this.plugin.collectMediaItems(this.config.source || undefined);
  }

  render(): void {
    this.plugin.renderLibrary(this.containerEl, this.collectItems(), {
      openFile: (path: string) => void this.plugin.app.workspace.openLinkText(path, this.sourcePath),
      addItem: (initialType: MediaType) => this.plugin.openAddModal(initialType),
      editItem: (path: string) => this.plugin.openEditModal(path),
      toggleFavorite: (path: string, next: boolean) => this.plugin.setFavorite(path, next),
      openTimeline: () => { void this.plugin.openTimeline(); },
      initialView: this.viewMode,
      onViewChange: (view: LibraryViewMode) => {
        this.viewMode = view;
        this.plugin.libraryViewModes.set(this.sourcePath, view);
      },
    });
  }
}

export class DetailActionsRenderChild extends MarkdownRenderChild {
  private renderTimer: number | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly plugin: AnimeListUiHost,
    private readonly sourcePath: string,
  ) {
    super(containerEl);
  }

  onload(): void {
    this.render();
    this.registerEvent(this.plugin.app.metadataCache.on("changed", (file) => {
      if (file instanceof TFile && file.path === this.sourcePath) this.scheduleRender();
    }));
  }

  scheduleRender(): void {
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.render(), 80);
  }

  onunload(): void {
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
  }

  render(): void {
    const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
    if (!(file instanceof TFile)) return;
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
    this.containerEl.replaceChildren();
    const bar = makeEl("div", "al-detail-actions");
    const summary = makeEl("div", "al-detail-summary");
    const mediaType: MediaType = fm.media_type === "manga" || fm.media_type === "novel" ? fm.media_type : "anime";
    const detailItem = {
      status: normalizeMediaStatus(fm.status),
      mediaType,
      releaseStatus: normalizeReleaseStatus(fm.release_status),
      progress: normalizeProgressValue(fm.progress),
      total: mediaType === "anime" ? normalizeProgressValue(fm.progress_total) : 0,
      unit: typeof fm.progress_unit === "string" ? fm.progress_unit : "",
    };
    const status = makeEl("span", `al-status status-${detailItem.status}`, itemStatusLabel(detailItem));
    const unitLabel = mediaUnitLabel(detailItem.unit);
    const hasTotal = detailItem.total !== 0 && detailItem.total !== "";
    const progress = makeEl("span", "", hasTotal
      ? `${progressDisplayValue(detailItem.progress)} / ${progressDisplayValue(detailItem.total)} ${unitLabel}`
      : detailItem.progress !== 0 ? uiText(detailItem.mediaType === "anime" ? "library.watchedProgress" : "library.readProgress", { progress: progressDisplayValue(detailItem.progress), unit: unitLabel }) : uiText("detail.noProgress"));
    summary.append(status, progress);
    if (fm.score != null && fm.score !== "") summary.appendChild(makeEl("span", "al-detail-score", `★ ${Number(fm.score).toFixed(1)}`));
    const actions = makeEl("div", "al-detail-buttons");
    const favorite = makeEl("button", `al-detail-favorite${fm.favorite === true ? " is-active" : ""}`, fm.favorite === true ? uiText("detail.favorite") : uiText("detail.favoriteAdd"));
    favorite.type = "button";
    favorite.addEventListener("click", () => { void this.plugin.setFavorite(file.path, fm.favorite !== true); });
    const edit = makeEl("button", "", uiText("action.edit"));
    edit.type = "button";
    edit.addEventListener("click", () => this.plugin.openEditModal(file.path));
    const library = makeEl("button", "", uiText("detail.library"));
    library.type = "button";
    library.addEventListener("click", () => { void this.plugin.openLibrary(); });
    actions.append(favorite, edit, library);
    const urls = asArray(fm.source_urls).filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    if (urls[0]) {
      const external = makeEl("button");
      external.type = "button";
      appendIconLabel(external, "external", uiText("detail.source"));
      external.addEventListener("click", () => window.open(String(urls[0]), "_blank"));
      actions.appendChild(external);
    }
    const remove = makeEl("button", "al-detail-delete", uiText("action.delete"));
    remove.type = "button";
    remove.addEventListener("click", () => new ConfirmDeleteModal(this.plugin, file, () => this.plugin.openLibrary()).open());
    actions.appendChild(remove);
    bar.append(summary, actions);
    this.containerEl.appendChild(bar);
    this.plugin.afterDetailRender(this.containerEl, this.sourcePath, fm);
  }
}


