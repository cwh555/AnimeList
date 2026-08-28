import type { ExternalMediaResult, MediaType, ReleaseStatus } from "./media-types";

export const MANUAL_MEDIA_PROVIDER = "manual";

export interface MediaCoverAssetInput {
  name: string;
  data: ArrayBuffer;
  contentType?: string;
}

export interface ManualMediaDraft {
  title: string;
  mediaType: MediaType;
  originalTitle?: string;
  format?: string;
  year?: number | string;
  releaseStatus?: ReleaseStatus;
}

export function manualMediaResult(draft: ManualMediaDraft): ExternalMediaResult {
  const title = draft.title.trim();
  return {
    provider: MANUAL_MEDIA_PROVIDER,
    sourceId: "",
    title,
    originalTitle: draft.originalTitle?.trim() || "",
    romajiTitle: "",
    mediaType: draft.mediaType,
    format: draft.format?.trim() || draft.mediaType,
    total: 0,
    unit: draft.mediaType === "anime" ? "episode" : draft.mediaType === "manga" ? "chapter" : "volume",
    year: draft.year ?? "",
    genres: [],
    rawGenres: [],
    people: [],
    platforms: [],
    sourceUrl: "",
    coverUrl: "",
    summary: "",
    externalScore: null,
    releaseStatus: draft.releaseStatus ?? "unknown",
    searchTitles: [],
    sources: [],
  };
}
