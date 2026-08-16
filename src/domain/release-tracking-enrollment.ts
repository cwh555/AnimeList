import type { MediaItem } from "./media-types";
import type { ReleaseTrackingSnapshot } from "./release-tracking";

export function isReleaseTrackingMedia(item: MediaItem): boolean {
  return item.mediaType === "manga" || item.mediaType === "novel";
}

export function hasExistingReleaseTracking(
  snapshot: ReleaseTrackingSnapshot,
  explicitStatus = false,
): boolean {
  return explicitStatus
    || snapshot.binding !== null
    || Boolean(snapshot.latest || snapshot.latestReleaseDate || snapshot.sourceLabel || snapshot.checkedAt || snapshot.error);
}

export function isReleaseTrackingEnabled(
  item: MediaItem,
  snapshot: ReleaseTrackingSnapshot,
  explicitStatus = false,
): boolean {
  if (!isReleaseTrackingMedia(item) || snapshot.status === "disabled") return false;
  if (item.status !== "completed") return true;
  return hasExistingReleaseTracking(snapshot, explicitStatus);
}

export function releaseTrackingItemsForRefresh(
  items: readonly MediaItem[],
  snapshotForItem: (item: MediaItem) => ReleaseTrackingSnapshot,
  hasExplicitStatus: (item: MediaItem) => boolean,
): MediaItem[] {
  return items.filter((item) => isReleaseTrackingEnabled(
    item,
    snapshotForItem(item),
    hasExplicitStatus(item),
  ));
}
