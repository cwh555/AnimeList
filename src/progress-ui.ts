/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- This module is the typed boundary around the legacy renderer and runtime-validated Obsidian frontmatter. */
import { AnimeListUI, DetailActionsRenderChild } from "./legacy";
import { normalizeMediaStatus } from "./media-status";
import { normalizeProgressValue, progressDisplayValue } from "./novel-progress";
import { progressPresentation } from "./progress-display";
import { uiText } from "./ui-text";
import type { MediaType, ProgressValue } from "./types";

interface ProgressRenderInput {
  mediaType: MediaType;
  status: string;
  progress: ProgressValue;
  total: ProgressValue;
  unit: string;
  text: string;
  trailingText?: string;
}

function progressStatusFromCard(card: HTMLElement): string {
  const statusClass = Array.from(card.classList).find((className) => className.startsWith("status-"));
  return statusClass?.slice("status-".length) ?? "planned";
}

function ensureTrack(container: HTMLElement): HTMLElement {
  let track = container.querySelector<HTMLElement>(":scope > .al-progress-track");
  if (!track) {
    track = document.createElement("div");
    track.className = "al-progress-track";
    container.prepend(track);
  }
  let fill = track.querySelector<HTMLElement>(":scope > .al-progress-fill");
  if (!fill) {
    fill = document.createElement("div");
    fill.className = "al-progress-fill";
    track.appendChild(fill);
  }
  return fill;
}

export function renderProgress(container: HTMLElement, input: ProgressRenderInput): void {
  const presentation = progressPresentation(input);
  const fill = ensureTrack(container);
  fill.style.width = `${Math.round(presentation.ratio * 100)}%`;
  container.classList.toggle("is-state-progress", presentation.kind === "state");
  container.classList.toggle("is-empty-progress", presentation.ratio === 0);

  let row = container.querySelector<HTMLElement>(":scope > .al-progress-row");
  if (!row) {
    row = document.createElement("div");
    row.className = "al-progress-row";
    container.appendChild(row);
  }
  row.replaceChildren();
  const text = document.createElement("span");
  text.textContent = input.text;
  row.appendChild(text);

  const trailingText = presentation.percentageLabel ?? input.trailingText;
  if (trailingText) {
    const trailing = document.createElement("span");
    trailing.textContent = trailingText;
    if (presentation.kind === "state") trailing.className = "al-release-label";
    row.appendChild(trailing);
  }
}

function synchronizeLibraryProgress(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".al-card").forEach((card) => {
    const progressContainer = card.querySelector<HTMLElement>(".al-progress");
    const row = progressContainer?.querySelector<HTMLElement>(":scope > .al-progress-row");
    if (!progressContainer || !row) return;

    const releaseLabel = row.querySelector<HTMLElement>(".al-release-label");
    if (!releaseLabel) return;

    const progressText = row.firstElementChild?.textContent?.trim() ?? "";
    const hasProgress = progressText !== "" && progressText !== uiText("library.notStarted");
    renderProgress(progressContainer, {
      mediaType: "manga",
      status: progressStatusFromCard(card),
      progress: hasProgress ? 1 : 0,
      total: 0,
      unit: "chapter",
      text: progressText,
      trailingText: releaseLabel.textContent?.trim() ?? "",
    });
  });
}

const originalRenderLibrary = AnimeListUI.renderLibrary.bind(AnimeListUI);
AnimeListUI.renderLibrary = (container: HTMLElement, inputItems: unknown[], adapters: unknown = {}) => {
  const result = originalRenderLibrary(container, inputItems, adapters);
  synchronizeLibraryProgress(container);

  const grid = container.querySelector<HTMLElement>(".al-grid");
  if (grid) {
    const observer = new MutationObserver(() => synchronizeLibraryProgress(container));
    observer.observe(grid, { childList: true, subtree: true });
  }
  return result;
};

const originalDetailRender = DetailActionsRenderChild.prototype.render;
DetailActionsRenderChild.prototype.render = function renderUnifiedDetailProgress(): void {
  originalDetailRender.call(this);

  const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
  if (!file) return;
  const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const mediaType = String(frontmatter.media_type || "anime") as MediaType;
  const progress = normalizeProgressValue(frontmatter.progress);
  const total = mediaType === "anime" ? normalizeProgressValue(frontmatter.progress_total) : 0;
  const unit = String(frontmatter.progress_unit || "");
  const detailContainer = this.containerEl as HTMLElement;
  const summary = detailContainer.querySelector<HTMLElement>(".al-detail-summary");
  const summaryProgress = summary?.querySelector<HTMLElement>("span:not(.al-status):not(.al-detail-score)");
  const text = summaryProgress?.textContent?.trim()
    || (progress !== 0
      ? uiText(mediaType === "anime" ? "library.watchedProgress" : "library.readProgress", {
        progress: progressDisplayValue(progress),
        unit,
      })
      : uiText("detail.noProgress"));
  summaryProgress?.remove();

  const progressContainer = document.createElement("div");
  progressContainer.className = "al-progress al-detail-progress";
  renderProgress(progressContainer, {
    mediaType,
    status: normalizeMediaStatus(frontmatter.status),
    progress,
    total,
    unit,
    text,
  });
  detailContainer.appendChild(progressContainer);
};
