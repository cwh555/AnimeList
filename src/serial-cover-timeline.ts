import type { NovelVolumeEntry } from "./types";

export function resolveSerialEntryCoverPaths(
  entries: readonly NovelVolumeEntry[],
  resolveCover: (cover: string) => string,
): NovelVolumeEntry[] {
  return entries.map((entry) => {
    if (!entry.cover) return { ...entry };
    const resolved = resolveCover(entry.cover);
    return {
      ...entry,
      cover: resolved || undefined,
    };
  });
}
