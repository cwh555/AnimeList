import type { MediaType } from "../../domain/media-types";
import { releaseTrackingSnapshotFromFrontmatter } from "../../domain/release-tracking";
import { makeEl } from "../../ui/ui-helpers";
import { attentionLabel, providerLabel } from "./presentation";
import { releaseTrackingText } from "./text";

function appendDetailRow(parent: HTMLElement, label: string, value: string, className = ""): void {
  const row = makeEl("span", `al-detail-summary${className ? ` ${className}` : ""}`);
  row.append(makeEl("strong", "", label), makeEl("span", "", value));
  parent.appendChild(row);
}

export function decorateDetail(container: HTMLElement, frontmatter: Record<string, unknown>): void {
  const mediaType: MediaType = frontmatter.media_type === "manga" || frontmatter.media_type === "novel"
    ? frontmatter.media_type
    : "anime";
  if (mediaType === "anime") return;
  const snapshot = releaseTrackingSnapshotFromFrontmatter(frontmatter, mediaType);
  if (!snapshot.latest && snapshot.status === "unconfigured") return;

  const panel = makeEl("section", "al-detail-actions al-release-tracking-detail");
  if (snapshot.latest) {
    appendDetailRow(
      panel,
      releaseTrackingText(mediaType === "manga" ? "detail.latestChapter" : "detail.latestVolume"),
      mediaType === "manga" ? `Ch.${snapshot.latest}` : `Vol.${snapshot.latest}`,
      "is-latest",
    );
  }
  const source = providerLabel(snapshot);
  if (source) appendDetailRow(panel, releaseTrackingText("detail.source"), source);
  if (snapshot.checkedAt) {
    const date = new Date(snapshot.checkedAt);
    appendDetailRow(
      panel,
      releaseTrackingText("detail.lastVerified"),
      Number.isFinite(date.getTime()) ? date.toLocaleString() : snapshot.checkedAt,
    );
  }
  if (snapshot.status !== "verified" && snapshot.status !== "disabled") {
    appendDetailRow(
      panel,
      releaseTrackingText("detail.statusAttention"),
      snapshot.error || attentionLabel(snapshot.status),
      "is-attention",
    );
  }
  container.appendChild(panel);
}
