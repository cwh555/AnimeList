export const MIN_RATING = 0;
export const MAX_RATING = 10;
export const RATING_INCREMENT = 0.5;

export type RatingNormalizationResult =
  | { kind: "empty"; value: null; changed: false }
  | { kind: "invalid"; value: null; changed: false }
  | { kind: "out-of-range"; value: number; changed: false }
  | { kind: "valid"; value: number; changed: boolean; original: number };

function isHalfPointRating(value: number): boolean {
  return Number.isInteger(value / RATING_INCREMENT);
}

export function normalizeRating(value: unknown): RatingNormalizationResult {
  if (value == null || value === "") {
    return { kind: "empty", value: null, changed: false };
  }

  const numericValue = Number(value);
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

export function formatRating(value: number): string {
  return value.toFixed(1);
}
