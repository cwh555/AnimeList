import { MarkdownRenderChild, Menu, TAbstractFile, TFile } from "obsidian";
import type { MediaItem, MediaType } from "../types";
import { normalizeMediaStatus } from "../domain/media-status";
import { normalizeProgressValue, normalizeReleaseStatus, progressDisplayValue } from "../domain/progress/novel-progress";
import { mediaFormatLabel, mediaProviderLabel, uiText } from "../ui-text";
import type { LibraryViewMode } from "./library-contracts";
import type { AnimeListUiHost } from "./plugin-host";
import { shouldRefreshAnimeListBlockPath, shouldRefreshAnimeListBlockRename } from "./markdown-refresh-scope";
import { detailMediaQuarterLabel } from "./media-quarter-label";
import { ConfirmDeleteModal } from "./media-modals";
import { appendIconLabel, asArray, itemStatusLabel, makeEl, mediaUnitLabel } from "./ui-helpers";
import { transitionSurface } from "./layout-motion";

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

function detailString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function detailList(value: unknown): string {
  return asArray(value).map(detailString).filter(Boolean).join(" · ");
}

function appendDetailMetaRow(container: HTMLElement, label: string, value: string | HTMLElement): void {
  if (typeof value === "string" && !value) return;
  const row = makeEl("div", "al-detail-meta-row");
  row.appendChild(makeEl("dt", "al-detail-meta-label", label));
  const dd = makeEl("dd", "al-detail-meta-value");
  if (typeof value === "string") dd.textContent = value;
  else dd.appendChild(value);
  row.appendChild(dd);
  container.appendChild(row);
}

export class DetailActionsRenderChild extends MarkdownRenderChild {
  private renderTimer: number | null = null;
  private legacyCoverElement: HTMLElement | null = null;
  private detailCoverCache: { resource: string; image: HTMLImageElement } | null = null;

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
    this.legacyCoverElement?.removeClass("animelist-detail-legacy-cover");
    this.legacyCoverElement = null;
    this.detailCoverCache = null;
  }

  private hideLegacyCoverEmbed(resourcePath: string): void {
    this.legacyCoverElement?.removeClass("animelist-detail-legacy-cover");
    this.legacyCoverElement = null;
    if (!resourcePath) return;
    window.requestAnimationFrame(() => {
      const block = this.containerEl.closest<HTMLElement>(".block-language-animelist-detail") ?? this.containerEl;
      let candidate = block.nextElementSibling as HTMLElement | null;
      for (let index = 0; candidate && index < 2; index += 1, candidate = candidate.nextElementSibling as HTMLElement | null) {
        const images = candidate.querySelectorAll<HTMLImageElement>("img");
        if (images.length === 1) {
          const image = images[0];
          const matches = image.src === resourcePath || image.getAttribute("src") === resourcePath;
          if (matches) {
            candidate.addClass("animelist-detail-legacy-cover");
            candidate.setAttribute("aria-hidden", "true");
            this.legacyCoverElement = candidate;
            return;
          }
        }
        if (candidate.textContent?.trim()) return;
      }
    });
  }

  private renderMoreMenu(event: MouseEvent, file: TFile, sourceUrl: string): void {
    const menu = new Menu();
    if (sourceUrl) {
      menu.addItem((item) => item
        .setTitle(uiText("detail.source"))
        .setIcon("external-link")
        .onClick(() => window.open(sourceUrl, "_blank")));
    }
    menu.addItem((item) => item
      .setTitle(uiText("action.delete"))
      .setIcon("trash-2")
      .setWarning(true)
      .onClick(() => new ConfirmDeleteModal(this.plugin, file, () => this.plugin.openLibrary()).open()));
    menu.showAtMouseEvent(event);
  }

  render(): void {
    const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
    if (!(file instanceof TFile)) return;
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
    transitionSurface(this.containerEl, () => this.containerEl.replaceChildren());

    const mediaType: MediaType = fm.media_type === "manga" || fm.media_type === "novel" ? fm.media_type : "anime";
    const detailItem = {
      status: normalizeMediaStatus(fm.status),
      mediaType,
      releaseStatus: normalizeReleaseStatus(fm.release_status),
      progress: normalizeProgressValue(fm.progress),
      total: mediaType === "anime" ? normalizeProgressValue(fm.progress_total) : 0,
      unit: typeof fm.progress_unit === "string" ? fm.progress_unit : "",
    };
    const unitLabel = mediaUnitLabel(detailItem.unit);
    const hasTotal = detailItem.total !== 0 && detailItem.total !== "";
    const progressText = hasTotal
      ? `${progressDisplayValue(detailItem.progress)} / ${progressDisplayValue(detailItem.total)} ${unitLabel}`
      : detailItem.progress !== 0
        ? uiText(detailItem.mediaType === "anime" ? "library.watchedProgress" : "library.readProgress", { progress: progressDisplayValue(detailItem.progress), unit: unitLabel })
        : uiText("detail.noProgress");

    const card = makeEl("div", "al-detail-card");
    const top = makeEl("div", "al-detail-topbar");
    const summary = makeEl("div", "al-detail-summary");
    const statusGroup = makeEl("div", "al-detail-stat");
    statusGroup.append(
      makeEl("span", "al-detail-stat-label", uiText("add.statusLabel")),
      makeEl("span", `al-detail-status-chip al-status status-${detailItem.status}`, itemStatusLabel(detailItem)),
    );
    const progressGroup = makeEl("div", "al-detail-stat");
    progressGroup.append(
      makeEl("span", "al-detail-stat-label", uiText(mediaType === "anime" ? "add.progressAnime" : mediaType === "manga" ? "add.progressManga" : "add.progressNovel")),
      makeEl("span", "al-detail-stat-value al-detail-progress-value", progressText),
    );
    summary.append(statusGroup, progressGroup);
    if (fm.score != null && fm.score !== "") {
      const scoreGroup = makeEl("div", "al-detail-stat");
      scoreGroup.append(
        makeEl("span", "al-detail-stat-label", uiText("field.score")),
        makeEl("span", "al-detail-stat-value al-detail-score", `★ ${Number(fm.score).toFixed(1)}`),
      );
      summary.appendChild(scoreGroup);
    }
    const quarter = detailMediaQuarterLabel(mediaType, fm.season, fm.season_year);
    if (quarter) {
      const quarterGroup = makeEl("div", "al-detail-stat");
      quarterGroup.append(
        makeEl("span", "al-detail-stat-label", uiText("add.metadataSeason")),
        makeEl("span", "al-detail-stat-value", quarter),
      );
      summary.appendChild(quarterGroup);
    }

    const urls = asArray(fm.source_urls).filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    const actions = makeEl("div", "al-detail-buttons");
    const favorite = makeEl("button", `al-detail-favorite${fm.favorite === true ? " is-active" : ""}`);
    favorite.type = "button";
    favorite.setAttribute("aria-label", fm.favorite === true ? uiText("detail.favorite") : uiText("detail.favoriteAdd"));
    favorite.title = favorite.getAttribute("aria-label") ?? "";
    appendIconLabel(favorite, "star", "");
    favorite.addEventListener("click", () => { void this.plugin.setFavorite(file.path, fm.favorite !== true); });
    const edit = makeEl("button");
    edit.type = "button";
    appendIconLabel(edit, "pencil", uiText("action.edit"));
    edit.addEventListener("click", () => this.plugin.openEditModal(file.path));
    const library = makeEl("button");
    library.type = "button";
    appendIconLabel(library, "library", uiText("detail.library"));
    library.addEventListener("click", () => { void this.plugin.openLibrary(); });
    const more = makeEl("button", "al-detail-more");
    more.type = "button";
    more.setAttribute("aria-label", uiText("detail.more"));
    more.title = uiText("detail.more");
    appendIconLabel(more, "ellipsis", "");
    more.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.renderMoreMenu(event, file, urls[0] ?? "");
    });
    actions.append(favorite, edit, library, more);
    top.append(summary, actions);
    card.appendChild(top);

    const body = makeEl("div", "al-detail-body");
    const coverPath = detailString(fm.cover);
    const coverResource = coverPath ? this.plugin.resolveMediaCoverPath(coverPath, file.path) : "";
    if (coverResource) {
      const cover = makeEl("div", "al-detail-cover");
      const image = this.detailCoverCache?.resource === coverResource
        ? this.detailCoverCache.image
        : makeEl("img");
      image.src = coverResource;
      image.alt = uiText("library.coverAlt", { title: detailString(fm.title) || file.basename });
      image.loading = "lazy";
      image.decoding = "async";
      this.detailCoverCache = { resource: coverResource, image };
      cover.appendChild(image);
      body.appendChild(cover);
    } else {
      this.detailCoverCache = null;
    }

    const metadata = makeEl("dl", "al-detail-metadata");
    appendDetailMetaRow(metadata, uiText("detail.originalTitle"), detailString(fm.title_original));
    appendDetailMetaRow(metadata, uiText("detail.romajiTitle"), detailString(fm.title_romaji));
    appendDetailMetaRow(metadata, uiText("detail.format"), mediaFormatLabel(detailString(fm.format)));
    if (hasTotal) appendDetailMetaRow(metadata, uiText("detail.total"), `${progressDisplayValue(detailItem.total)} ${unitLabel}`.trim());
    appendDetailMetaRow(metadata, uiText("detail.year"), detailString(fm.year));
    const people = detailList(mediaType === "anime" ? fm.studios : fm.authors);
    appendDetailMetaRow(metadata, uiText(mediaType === "anime" ? "detail.studio" : "detail.authors"), people);
    const provider = detailString(fm.source_provider);
    if (provider || urls[0]) {
      const source = makeEl("span", "al-detail-source-value");
      const sourceLabel = provider ? mediaProviderLabel(provider) : urls[0] ?? "";
      if (urls[0]) {
        const link = makeEl("a", "", sourceLabel);
        link.href = urls[0];
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        source.appendChild(link);
      } else {
        source.textContent = sourceLabel;
      }
      appendDetailMetaRow(metadata, uiText("detail.provider"), source);
    }
    body.appendChild(metadata);
    card.appendChild(body);
    this.containerEl.appendChild(card);
    this.hideLegacyCoverEmbed(coverResource);
    this.plugin.afterDetailRender(this.containerEl, this.sourcePath, fm);
  }
}
