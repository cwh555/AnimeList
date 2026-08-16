import { peekCoverSources } from "../../data/cover-cache";
import type { MediaItem } from "../../types";

export function prepareScoreDashboardCoverSources(items: readonly MediaItem[]): MediaItem[] {
  return items.map((item) => {
    const coverSources = peekCoverSources(item.coverSources);
    return coverSources === item.coverSources ? item : { ...item, coverSources };
  });
}
