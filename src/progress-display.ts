import { normalizeMediaStatus } from "./media-status";
import { progressRatio } from "./novel-progress";
import type { MediaStatus } from "./media-status";
import type { MediaType, ProgressValue } from "./types";

export type ProgressKind = "numeric" | "state";

export interface ProgressPresentationInput {
  mediaType: MediaType;
  status: MediaStatus | string;
  progress: ProgressValue;
  total: ProgressValue;
  unit: string;
}

export interface ProgressPresentation {
  kind: ProgressKind;
  ratio: number;
  percentageLabel: string | null;
  hasProgress: boolean;
}

export function hasRecordedProgress(value: ProgressValue): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  const text = String(value ?? "").normalize("NFKC").trim();
  if (!text) return false;
  const numericValue = Number(text);
  return Number.isFinite(numericValue) ? numericValue > 0 : text !== "0";
}

export function progressPresentation(input: ProgressPresentationInput): ProgressPresentation {
  const status = normalizeMediaStatus(input.status);
  const hasProgress = hasRecordedProgress(input.progress);

  if (input.mediaType === "anime") {
    const ratio = progressRatio(input.progress, input.total, input.unit) ?? 0;
    return {
      kind: "numeric",
      ratio,
      percentageLabel: progressRatio(input.progress, input.total, input.unit) === null
        ? null
        : `${Math.round(ratio * 100)}%`,
      hasProgress,
    };
  }

  const ratio = status === "completed"
    ? 1
    : (status === "ongoing" || status === "dropped") && hasProgress
      ? 0.5
      : 0;

  return {
    kind: "state",
    ratio,
    percentageLabel: null,
    hasProgress,
  };
}
