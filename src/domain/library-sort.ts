import type { MediaItem } from "./media-types";
import { completionDateTimestamp, isUnknownCompletionDate } from "./completion-date";
import { compareMediaTitles } from "./media-title-sort";

export type LibraryCompletionSortDirection = "asc" | "desc";

type LibraryCompletionComparable = Pick<MediaItem, "status" | "completedAt"> & Partial<Pick<MediaItem, "title">>;

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
 * Items sharing the same temporal key always use ascending natural title order
 * so seasons/volumes remain old-to-new regardless of the date direction.
 */
export function compareLibraryCompletion(
  left: LibraryCompletionComparable,
  right: LibraryCompletionComparable,
  direction: LibraryCompletionSortDirection,
): number {
  const a = completionSortKey(left);
  const b = completionSortKey(right);
  const titleOrder = (): number => compareMediaTitles(left.title ?? "", right.title ?? "");
  if (a.kind === "missing" || b.kind === "missing") {
    if (a.kind === b.kind) return titleOrder();
    return a.kind === "missing" ? 1 : -1;
  }
  if (a.time === b.time) return titleOrder();
  return direction === "desc" ? b.time - a.time : a.time - b.time;
}
