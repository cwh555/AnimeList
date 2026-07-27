/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment -- Compatibility Markdown renderers preserve established blocks while delegating feature composition to typed hooks. */
// @ts-nocheck
import { MarkdownRenderChild, setIcon } from "obsidian";
import { AnimeListUI } from "./library-ui";
import { ConfirmDeleteModal } from "./media-modals";
import { normalizeProgressValue, normalizeReleaseStatus, progressDisplayValue } from "../novel-progress";
import { mediaStatusLabel, uiText } from "../ui-text";

export function parseAnimeListBlockConfig(source: string): Record<string, string> {
  const config: Record<string, string> = {};
  for (const line of source.split("\n")) {
    const index = line.indexOf(":");
    if (index < 0) continue;
    config[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return config;
}

const LABEL = {
  unit: {
    get episode() { return uiText("media.unit.episode"); },
    get chapter() { return uiText("media.unit.chapter"); },
    get volume() { return uiText("media.unit.volume"); },
    get page() { return uiText("media.unit.page"); },
    get percent() { return uiText("media.unit.percent"); },
  },
};
function asArray(value) { return value == null ? [] : Array.isArray(value) ? value : [value]; }
function makeEl(tag, className = "", text) {
  const node = createEl(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}
function setAnimeListIcon(element, name) {
  const icons = { external: "external-link" };
  setIcon(element, icons[name] || name);
  return element;
}
function appendIconLabel(element, icon, label) {
  setAnimeListIcon(element, icon);
  element.appendChild(makeEl("span", "", label));
  return element;
}
function itemStatusLabel(item) { return mediaStatusLabel(item.status, item.mediaType); }

export class AnimeListRenderChild extends MarkdownRenderChild {
  constructor(containerEl, plugin, sourcePath, config) {
    super(containerEl);
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.config = config;
    this.renderTimer = null;
    this.viewMode = this.plugin.libraryViewModes?.get(this.sourcePath) || "grid";
  }

  onload() {
    this.render();
    this.registerEvent(this.plugin.app.metadataCache.on("changed", () => this.scheduleRender()));
    this.registerEvent(this.plugin.app.vault.on("create", () => this.scheduleRender()));
    this.registerEvent(this.plugin.app.vault.on("delete", () => this.scheduleRender()));
    this.registerEvent(this.plugin.app.vault.on("rename", () => this.scheduleRender()));
  }

  scheduleRender() {
    window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.render(), 120);
  }

  onunload() {
    window.clearTimeout(this.renderTimer);
  }

  collectItems() {
    return this.plugin.collectMediaItems(this.config.source || undefined);
  }

  render() {
    AnimeListUI.renderLibrary(this.containerEl, this.collectItems(), {
      features: this.plugin.features,
      openFile: (path) => this.plugin.app.workspace.openLinkText(path, this.sourcePath),
      addItem: (initialType) => this.plugin.openAddModal(initialType),
      editItem: (path) => this.plugin.openEditModal(path),
      toggleFavorite: (path, next) => this.plugin.setFavorite(path, next),
      openTimeline: () => this.plugin.openTimeline(),
      initialView: this.viewMode,
      onViewChange: (view) => {
        this.viewMode = view;
        this.plugin.libraryViewModes?.set(this.sourcePath, view);
      },
    });
  }
}

export class DetailActionsRenderChild extends MarkdownRenderChild {
  constructor(containerEl, plugin, sourcePath) {
    super(containerEl);
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.renderTimer = null;
  }

  onload() {
    this.render();
    this.registerEvent(this.plugin.app.metadataCache.on("changed", (file) => {
      if (file?.path === this.sourcePath) this.scheduleRender();
    }));
  }

  scheduleRender() {
    window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.render(), 80);
  }

  onunload() {
    window.clearTimeout(this.renderTimer);
  }

  render() {
    const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
    if (!file) return;
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
    this.containerEl.replaceChildren();
    const bar = makeEl("div", "al-detail-actions");
    const summary = makeEl("div", "al-detail-summary");
    const detailItem = {
      status: fm.status || "planned", mediaType: fm.media_type || "anime", releaseStatus: normalizeReleaseStatus(fm.release_status),
      progress: normalizeProgressValue(fm.progress), total: String(fm.media_type || "anime") === "anime" ? normalizeProgressValue(fm.progress_total) : 0, unit: fm.progress_unit || "",
    };
    const status = makeEl("span", `al-status status-${detailItem.status}`, itemStatusLabel(detailItem));
    const unitLabel = LABEL.unit[detailItem.unit] || detailItem.unit || "";
    const hasTotal = detailItem.total !== 0 && detailItem.total !== "";
    const progress = makeEl("span", "", hasTotal
      ? `${progressDisplayValue(detailItem.progress)} / ${progressDisplayValue(detailItem.total)} ${unitLabel}`
      : detailItem.progress !== 0 ? uiText(detailItem.mediaType === "anime" ? "library.watchedProgress" : "library.readProgress", { progress: progressDisplayValue(detailItem.progress), unit: unitLabel }) : uiText("detail.noProgress"));
    summary.append(status, progress);
    if (fm.score != null && fm.score !== "") summary.appendChild(makeEl("span", "al-detail-score", `★ ${Number(fm.score).toFixed(1)}`));
    const actions = makeEl("div", "al-detail-buttons");
    const favorite = makeEl("button", `al-detail-favorite${fm.favorite === true ? " is-active" : ""}`, fm.favorite === true ? uiText("detail.favorite") : uiText("detail.favoriteAdd"));
    favorite.type = "button";
    favorite.addEventListener("click", () => this.plugin.setFavorite(file.path, fm.favorite !== true));
    const edit = makeEl("button", "", uiText("action.edit"));
    edit.type = "button";
    edit.addEventListener("click", () => this.plugin.openEditModal(file.path));
    const library = makeEl("button", "", uiText("detail.library"));
    library.type = "button";
    library.addEventListener("click", () => this.plugin.openLibrary());
    actions.append(favorite, edit, library);
    const urls = asArray(fm.source_urls).filter(Boolean);
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
    this.plugin.features.renderDetails({
      container: this.containerEl,
      sourcePath: this.sourcePath,
      frontmatter: fm,
    });
  }
}

/* eslint-enable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment -- End compatibility renderer lint scope. */
