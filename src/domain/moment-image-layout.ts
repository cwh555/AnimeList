export const MOMENT_IMAGE_LAYOUTS = ["carousel", "stacked"] as const;
export type MomentImageLayout = typeof MOMENT_IMAGE_LAYOUTS[number];

export const DEFAULT_MOMENT_STACK_REVEAL = 46;
export const MIN_MOMENT_STACK_REVEAL = 28;
export const MAX_MOMENT_STACK_REVEAL = 96;
export const DEFAULT_MOMENT_STACK_FOCUS_Y = 86;
export const TOP_MOMENT_STACK_FOCUS_Y = 50;

export interface MomentImageLayoutInput {
  imageLayout?: unknown;
  stackReveal?: unknown;
  stackFocusY?: Iterable<unknown>;
}

export interface MomentImageLayoutState {
  imageLayout?: "stacked";
  stackReveal?: number;
  stackFocusY?: number[];
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

export function normalizeMomentStackReveal(value: unknown): number {
  const parsed = finiteNumber(value);
  if (parsed === null) return DEFAULT_MOMENT_STACK_REVEAL;
  return Math.round(clamp(parsed, MIN_MOMENT_STACK_REVEAL, MAX_MOMENT_STACK_REVEAL));
}

export function normalizeMomentStackFocus(value: unknown, fallback = DEFAULT_MOMENT_STACK_FOCUS_Y): number {
  const parsed = finiteNumber(value);
  if (parsed === null) return fallback;
  return Math.round(clamp(parsed, 0, 100));
}

export function normalizeMomentStackFocusY(
  values: Iterable<unknown> | undefined,
  imageCount: number,
): number[] {
  const count = Math.max(0, Math.trunc(imageCount));
  const input = [...(values ?? [])];
  return Array.from({ length: count }, (_, index) => normalizeMomentStackFocus(
    input[index],
    index === 0 ? TOP_MOMENT_STACK_FOCUS_Y : DEFAULT_MOMENT_STACK_FOCUS_Y,
  ));
}

export function momentImageLayoutState(
  input: MomentImageLayoutInput,
  imageCount: number,
): MomentImageLayoutState {
  if (Math.trunc(imageCount) < 2 || normalizeMomentImageLayout(input.imageLayout) !== "stacked") return {};
  return {
    imageLayout: "stacked",
    stackReveal: normalizeMomentStackReveal(input.stackReveal),
    stackFocusY: normalizeMomentStackFocusY(input.stackFocusY, imageCount),
  };
}

export function momentStackFocusAfterDrag(startFocus: unknown, deltaY: number): number {
  const start = normalizeMomentStackFocus(startFocus);
  const delta = Number.isFinite(deltaY) ? deltaY : 0;
  return normalizeMomentStackFocus(start - delta * 0.45, start);
}
