export const MIN_RATING = 0;
export const MAX_RATING = 10;
export const RATING_INCREMENT = 0.5;

export type RatingNormalizationResult =
  | { kind: "empty"; value: null; changed: false }
  | { kind: "invalid"; value: null; changed: false }
  | { kind: "out-of-range"; value: number; changed: false }
  | { kind: "valid"; value: number; changed: boolean; original: number };

export type RatingStepDirection = -1 | 1;

function isHalfPointRating(value: number): boolean {
  return Number.isInteger(value / RATING_INCREMENT);
}

export function isEmptyRating(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

export function normalizeRating(value: unknown): RatingNormalizationResult {
  if (isEmptyRating(value)) {
    return { kind: "empty", value: null, changed: false };
  }

  const candidate = typeof value === "string" ? value.trim() : value;
  const numericValue = Number(candidate);
  if (!Number.isFinite(numericValue)) {
    return { kind: "invalid", value: null, changed: false };
  }
  if (numericValue < MIN_RATING || numericValue > MAX_RATING) {
    return { kind: "out-of-range", value: numericValue, changed: false };
  }

  const rounded = Math.round(numericValue / RATING_INCREMENT) * RATING_INCREMENT;
  const valueAtIncrement = Number(rounded.toFixed(1));
  return {
    kind: "valid",
    value: valueAtIncrement,
    changed: !isHalfPointRating(numericValue),
    original: numericValue,
  };
}

export function stepRating(value: unknown, direction: RatingStepDirection): number | null {
  const normalized = normalizeRating(value);
  if (normalized.kind !== "valid") return null;
  const stepped = normalized.value + direction * RATING_INCREMENT;
  return Math.min(MAX_RATING, Math.max(MIN_RATING, Number(stepped.toFixed(1))));
}

export function formatRating(value: number): string {
  return value.toFixed(1);
}
