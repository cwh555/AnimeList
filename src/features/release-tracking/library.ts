import type { AnimeListFeatureHost } from "../../app/feature-types";
import type { MediaItem, MediaType } from "../../domain/media-types";
import type { ReleaseTrackingSnapshot } from "../../domain/release-tracking";
import { makeEl } from "../../ui/ui-helpers";
import { openMatchModal, serviceFor } from "./controller";
import { attentionLabel, providerLabel } from "./presentation";
import { releaseTrackingText } from "./text";

function latestLabel(mediaType: MediaType, latest: string): string {
  return releaseTrackingText(
    mediaType === "manga" ? "library.latestChapter" : "library.latestVolume",
    { latest },
  );
}

function snapshotForItem(item: MediaItem, host: AnimeListFeatureHost): ReleaseTrackingSnapshot | null {
  if (item.mediaType === "anime") return null;
  try {
    return serviceFor(host).state.read(item.filePath, item.mediaType);
  } catch {
    return null;
  }
}

export function decorateReleaseCards(
  host: AnimeListFeatureHost,
  container: HTMLElement,
  items: readonly MediaItem[],
): void {
  for (const item of items) {
    const snapshot = snapshotForItem(item, host);
    if (!snapshot || (!snapshot.latest && snapshot.status === "unconfigured")) continue;
    const card = Array.from(container.querySelectorAll<HTMLElement>(".al-card"))
      .find((candidate) => candidate.dataset.path === item.filePath);
    const progress = card?.querySelector<HTMLElement>(".al-progress");
    if (!card || !progress || progress.querySelector(":scope > .al-release-tracking-card")) continue;

    const row = makeEl("div", "al-card-footer al-release-tracking-card");
    if (snapshot.latest) {
      const latest = makeEl("span", "al-score", latestLabel(item.mediaType, snapshot.latest));
      row.appendChild(latest);
      const source = providerLabel(snapshot);
      if (source) row.appendChild(makeEl("span", "al-result-meta", source));
    }
    if (snapshot.status !== "verified" && snapshot.status !== "disabled") {
      const canReview = snapshot.status === "ambiguous" || snapshot.status === "unmatched";
      const warning = makeEl(
        canReview ? "button" : "span",
        "al-status-chip is-active",
        releaseTrackingText("library.needsAttention"),
      );
      warning.title = snapshot.error || attentionLabel(snapshot.status);
      if (warning instanceof HTMLButtonElement) {
        warning.type = "button";
        warning.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openMatchModal(host, item);
        });
      }
      row.appendChild(warning);
    }
    progress.appendChild(row);
  }
}
