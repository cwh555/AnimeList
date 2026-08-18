export const MOMENT_IMAGE_LAYOUTS = ["carousel", "stacked"] as const;
export type MomentImageLayout = typeof MOMENT_IMAGE_LAYOUTS[number];

export const DEFAULT_MOMENT_STACK_GAP = 46;
export const MIN_MOMENT_STACK_GAP = 28;
export const MAX_MOMENT_STACK_GAP = 96;

export interface MomentImageLayoutInput {
  imageLayout?: unknown;
  stackGapsY?: Iterable<unknown>;
}

export interface MomentImageLayoutState {
  imageLayout?: "stacked";
  stackGapsY?: number[];
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const number = Number(value.trim());
  return Number.isFinite(number) ? number : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeMomentImageLayout(value: unknown): MomentImageLayout {
  return typeof value === "string" && value.trim().toLowerCase() === "stacked" ? "stacked" : "carousel";
}

export function normalizeMomentStackGap(value: unknown, fallback = DEFAULT_MOMENT_STACK_GAP): number {
  const parsed = finiteNumber(value);
  const normalizedFallback = Math.round(clamp(fallback, MIN_MOMENT_STACK_GAP, MAX_MOMENT_STACK_GAP));
  if (parsed === null) return normalizedFallback;
  return Math.round(clamp(parsed, MIN_MOMENT_STACK_GAP, MAX_MOMENT_STACK_GAP));
}

export function normalizeMomentStackGapsY(
  values: Iterable<unknown> | undefined,
  imageCount: number,
  fallbackGap = DEFAULT_MOMENT_STACK_GAP,
): number[] {
  const count = Math.max(0, Math.trunc(imageCount));
  if (count === 0) return [];
  const input = [...(values ?? [])];
  const gaps = Array.from({ length: count }, (_, index) => (
    index === 0 ? 0 : normalizeMomentStackGap(input[index], fallbackGap)
  ));
  return gaps;
}

export function momentStackOffsetsY(gapsY: Iterable<unknown> | undefined, imageCount: number): number[] {
  const gaps = normalizeMomentStackGapsY(gapsY, imageCount);
  let offset = 0;
  return gaps.map((gap, index) => {
    if (index > 0) offset += gap;
    return offset;
  });
}

export function momentStackAverageGap(gapsY: Iterable<unknown> | undefined, imageCount: number): number {
  const gaps = normalizeMomentStackGapsY(gapsY, imageCount);
  if (gaps.length < 2) return DEFAULT_MOMENT_STACK_GAP;
  const total = gaps.slice(1).reduce((sum, gap) => sum + gap, 0);
  return Math.round(total / (gaps.length - 1));
}

export function momentStackGapsWithDelta(
  gapsY: Iterable<unknown> | undefined,
  imageCount: number,
  deltaY: number,
): number[] {
  const gaps = normalizeMomentStackGapsY(gapsY, imageCount);
  const delta = Number.isFinite(deltaY) ? deltaY : 0;
  return gaps.map((gap, index) => index === 0 ? 0 : normalizeMomentStackGap(gap + delta));
}

export function momentStackGapAfterDrag(startGap: unknown, deltaY: number): number {
  const start = normalizeMomentStackGap(startGap);
  const delta = Number.isFinite(deltaY) ? deltaY : 0;
  return normalizeMomentStackGap(start + delta, start);
}

export function momentImageLayoutState(
  input: MomentImageLayoutInput,
  imageCount: number,
): MomentImageLayoutState {
  if (Math.trunc(imageCount) < 2 || normalizeMomentImageLayout(input.imageLayout) !== "stacked") return {};
  return {
    imageLayout: "stacked",
    stackGapsY: normalizeMomentStackGapsY(input.stackGapsY, imageCount),
  };
}
