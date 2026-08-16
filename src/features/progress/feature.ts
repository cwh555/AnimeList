import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { progressPresentation } from "../../domain/progress/display";
import { uiText } from "../../ui-text";
import type { MediaType, ProgressValue } from "../../types";

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

export const progressUiFeature = defineFeature<AnimeListFeatureHost>({
  id: "progress-display",
  contributions: [{
    kind: "library",
    afterRender({ container }): void {
      synchronizeLibraryProgress(container);
    },
  },
  ],
});
