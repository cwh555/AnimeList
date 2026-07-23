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

interface LegacyLibraryUi {
  renderLibrary(container: HTMLElement, inputItems: unknown[], adapters?: unknown): unknown;
}

interface DetailRenderInstance {
  plugin: {
    app: {
      vault: {
        getAbstractFileByPath(path: string): unknown;
      };
      metadataCache: {
        getFileCache(file: unknown): { frontmatter?: Record<string, unknown> } | null;
      };
    };
  };
  sourcePath: string;
  containerEl: HTMLElement;
}

type DetailRender = (this: DetailRenderInstance) => void;

function progressStatusFromCard(card: HTMLElement): string {
  const statusClass = Array.from(card.classList).find((className) => className.startsWith("status-"));
  return statusClass?.slice("status-".length) ?? "planned";
}

function ensureTrack(container: HTMLElement): HTMLElement {
  let track = container.querySelector<HTMLElement>(":scope > .al-progress-track");
  if (!track) {
    track = createDiv({ cls: "al-progress-track" });
    container.prepend(track);
  }
  let fill = track.querySelector<HTMLElement>(":scope > .al-progress-fill");
  if (!fill) {
    fill = createDiv({ cls: "al-progress-fill" });
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
    row = createDiv({ cls: "al-progress-row" });
    container.appendChild(row);
  }
  row.replaceChildren();
  row.appendChild(createSpan({ text: input.text }));

  const trailingText = presentation.percentageLabel ?? input.trailingText;
  if (trailingText) {
    row.appendChild(createSpan({
      cls: presentation.kind === "state" ? "al-release-label" : undefined,
      text: trailingText,
    }));
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

const libraryUi = AnimeListUI as unknown as LegacyLibraryUi;
const originalRenderLibrary = libraryUi.renderLibrary.bind(libraryUi);
libraryUi.renderLibrary = (container: HTMLElement, inputItems: unknown[], adapters: unknown = {}) => {
  const result = originalRenderLibrary(container, inputItems, adapters);
  synchronizeLibraryProgress(container);

  const grid = container.querySelector<HTMLElement>(".al-grid");
  if (grid) {
    const observer = new MutationObserver(() => synchronizeLibraryProgress(container));
    observer.observe(grid, { childList: true, subtree: true });
  }
  return result;
};

const detailPrototype = DetailActionsRenderChild.prototype as unknown as { render: DetailRender };
/* eslint-disable @typescript-eslint/unbound-method -- The method is immediately restored with its runtime instance through Function.call. */
const originalDetailRender = detailPrototype.render;
/* eslint-enable @typescript-eslint/unbound-method */
detailPrototype.render = function renderUnifiedDetailProgress(): void {
  originalDetailRender.call(this);

  const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
  if (!file) return;
  const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const mediaType = String(frontmatter.media_type || "anime") as MediaType;
  const progress = normalizeProgressValue(frontmatter.progress);
  const total = mediaType === "anime" ? normalizeProgressValue(frontmatter.progress_total) : 0;
  const unit = String(frontmatter.progress_unit || "");
  const summary = this.containerEl.querySelector<HTMLElement>(".al-detail-summary");
  const summaryProgress = summary?.querySelector<HTMLElement>("span:not(.al-status):not(.al-detail-score)");
  const text = summaryProgress?.textContent?.trim()
    || (progress !== 0
      ? uiText(mediaType === "anime" ? "library.watchedProgress" : "library.readProgress", {
        progress: progressDisplayValue(progress),
        unit,
      })
      : uiText("detail.noProgress"));
  summaryProgress?.remove();

  const progressContainer = createDiv({ cls: "al-progress al-detail-progress" });
  renderProgress(progressContainer, {
    mediaType,
    status: normalizeMediaStatus(frontmatter.status),
    progress,
    total,
    unit,
    text,
  });
  this.containerEl.appendChild(progressContainer);
};
