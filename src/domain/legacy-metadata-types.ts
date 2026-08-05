export type LegacyMetadataCleanupPhase = "scanning" | "enriching" | "writing" | "completed";

export interface LegacyMetadataCleanupProgress {
  phase: LegacyMetadataCleanupPhase;
  completed: number;
  total: number;
  title: string;
  message: string;
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
}
