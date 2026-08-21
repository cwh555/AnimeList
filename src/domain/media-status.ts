export const MEDIA_STATUS_VALUES = ["planned", "ongoing", "completed", "dropped"] as const;
export const MEDIA_STATUS_FILTER_ORDER = ["ongoing", "completed", "planned", "dropped"] as const;

export type MediaStatus = typeof MEDIA_STATUS_VALUES[number];
export type MediaStatusFilter = "all" | MediaStatus;

const STATUS_ALIASES: Readonly<Record<string, MediaStatus>> = {
  planned: "planned",
  wishlist: "planned",
  on_hold: "planned",
  paused: "planned",
  ongoing: "ongoing",
  on_going: "ongoing",
  watching: "ongoing",
  reading: "ongoing",
  active: "ongoing",
  completed: "completed",
  dropped: "dropped",
};

export function mediaStatusStorageKey(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[\s-]+/g, "_")
    : "";
}

export function canonicalMediaStatus(value: unknown): MediaStatus | null {
  return STATUS_ALIASES[mediaStatusStorageKey(value)] ?? null;
}

export function isMediaStatus(value: unknown): value is MediaStatus {
  const key = mediaStatusStorageKey(value);
  return (MEDIA_STATUS_VALUES as readonly string[]).includes(key);
}

export function normalizeMediaStatus(value: unknown, fallback: MediaStatus = "planned"): MediaStatus {
  return canonicalMediaStatus(value) ?? fallback;
}

export function normalizeStatusFilter(value: unknown): MediaStatusFilter {
  return mediaStatusStorageKey(value) === "all" ? "all" : normalizeMediaStatus(value);
}

export function mediaStatusMatches(value: unknown, filter: MediaStatusFilter): boolean {
  return filter === "all" || normalizeMediaStatus(value) === filter;
}

export function shouldMigrateMediaStatus(value: unknown): boolean {
  const canonical = canonicalMediaStatus(value);
  return canonical !== null && mediaStatusStorageKey(value) !== canonical;
}
