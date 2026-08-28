import type { MediaItem } from "./media-types";
import { completionDateTimestamp, isUnknownCompletionDate } from "./completion-date";

export type LibraryCompletionSortDirection = "asc" | "desc";

interface CompletionSortKey {
  kind: "ongoing" | "dated" | "missing";
  time: number;
}

function completionSortKey(item: Pick<MediaItem, "status" | "completedAt">): CompletionSortKey {
  if (item.status === "ongoing") return { kind: "ongoing", time: Number.POSITIVE_INFINITY };
  const timestamp = completionDateTimestamp(item.completedAt);
  if (timestamp !== null) return { kind: "dated", time: timestamp };
  if (isUnknownCompletionDate(item.completedAt)) return { kind: "missing", time: 0 };
  return { kind: "missing", time: 0 };
}

/**
 * Ongoing works are semantically newer than every completed work because their
 * completion point is still in the future. Undated/missing completion values
 * stay at the end in both directions instead of being assigned a fake date.
 */
export function compareLibraryCompletion(
  left: Pick<MediaItem, "status" | "completedAt">,
  right: Pick<MediaItem, "status" | "completedAt">,
  direction: LibraryCompletionSortDirection,
): number {
  const a = completionSortKey(left);
  const b = completionSortKey(right);
  if (a.kind === "missing" || b.kind === "missing") {
    if (a.kind === b.kind) return 0;
    return a.kind === "missing" ? 1 : -1;
  }
  if (a.time === b.time) return 0;
  return direction === "desc" ? b.time - a.time : a.time - b.time;
}
