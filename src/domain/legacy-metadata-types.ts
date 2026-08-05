export type LegacyMetadataCleanupPhase = "scanning" | "enriching" | "writing" | "completed";

export interface LegacyMetadataCleanupProgress {
  phase: LegacyMetadataCleanupPhase;
  completed: number;
  total: number;
  title: string;
  message: string;
}

export type LegacyMetadataEnrichmentStatus = "not-needed" | "enriched" | "unavailable" | "failed";

export interface LegacyMetadataCleanupDetail {
  title: string;
  path: string;
  changes: string[];
  enrichment: LegacyMetadataEnrichmentStatus;
  error?: string;
}

export interface LegacyMetadataCleanupResult {
  scanned: number;
  cleaned: number;
  enriched: number;
  unavailable: number;
  failed: number;
  genres: number;
  sourceGenres: number;
  studios: number;
  classification: number;
  details: LegacyMetadataCleanupDetail[];
}
