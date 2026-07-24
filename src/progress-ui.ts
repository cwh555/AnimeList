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
  renderLibrary: (container: HTMLElement, inputItems: unknown[], adapters?: unknown) => void;
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

function primitiveString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function mediaTypeValue(value: unknown): MediaType {
  return value === "manga" || value === "novel" ? value : "anime";
}

function legacyLibraryUi(value: unknown): LegacyLibraryUi {
  return value as LegacyLibraryUi;
}

function legacyLibraryRender(value: unknown): LegacyLibraryUi["renderLibrary"] {
  return value as LegacyLibraryUi["renderLibrary"];
}

function progressStatusFromCard(card: HTMLElement): string {
  const statusClass = Array.from(card.classList).find((className) => className.startsWith("status-"));
  return statusClass?.slice("status-".length) ?? "planned";
}

function ensureTrack(container: HTMLElement): HTMLElement {
  let track = container.querySelector<HTMLElement>(":scope > .al-progress-track");
  if (!track) {
    track = container.createDiv({ cls: "al-progress-track" });
    container.prepend(track);
  }
  let fill = track.querySelector<HTMLElement>(":scope > .al-progress-fill");
  if (!fill) fill = track.createDiv({ cls: "al-progress-fill" });
  return fill;
}

export function renderProgress(container: HTMLElement, input: ProgressRenderInput): void {
  const presentation = progressPresentation(input);
  const fill = ensureTrack(container);
  fill.style.width = `${Math.round(presentation.ratio * 100)}%`;
  container.classList.toggle("is-state-progress", presentation.kind === "state");
  container.classList.toggle("is-empty-progress", presentation.ratio === 0);

  let row = container.querySelector<HTMLElement>(":scope > .al-progress-row");
  if (!row) row = container.createDiv({ cls: "al-progress-row" });
  row.replaceChildren();
  row.createSpan({ text: input.text });

  const trailingText = presentation.percentageLabel ?? input.trailingText;
  if (trailingText) {
    row.createSpan({
      cls: presentation.kind === "state" ? "al-release-label" : undefined,
      text: trailingText,
    });
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

const libraryUi = legacyLibraryUi(AnimeListUI);
const originalRenderLibrary = legacyLibraryRender(libraryUi.renderLibrary);
libraryUi.renderLibrary = (container: HTMLElement, inputItems: unknown[], adapters: unknown = {}) => {
  originalRenderLibrary.call(libraryUi, container, inputItems, adapters);
  synchronizeLibraryProgress(container);
};

const detailPrototype = DetailActionsRenderChild.prototype as unknown as { render: DetailRender };
const originalDetailRender: DetailRender = detailPrototype.render;
detailPrototype.render = function renderUnifiedDetailProgress(): void {
  originalDetailRender.call(this);

  const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
  if (!file) return;
  const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const mediaType = mediaTypeValue(frontmatter.media_type);
  const progress = normalizeProgressValue(frontmatter.progress);
  const total = mediaType === "anime" ? normalizeProgressValue(frontmatter.progress_total) : 0;
  const unit = primitiveString(frontmatter.progress_unit);
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

  const progressContainer = this.containerEl.createDiv({ cls: "al-progress al-detail-progress" });
  renderProgress(progressContainer, {
    mediaType,
    status: normalizeMediaStatus(frontmatter.status),
    progress,
    total,
    unit,
    text,
  });
};
