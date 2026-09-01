export interface ImageSectionDragHitRegion<T> {
  value: T;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ImageSectionDragHitGeometry<T> {
  width: number;
  height: number;
  maxBottom: number;
  terminalRegionValue?: T | null;
  regions: ImageSectionDragHitRegion<T>[];
}

export type ImageSectionDragHitDecision<T> =
  | { kind: "region"; region: ImageSectionDragHitRegion<T> }
  | { kind: "append" }
  | { kind: "hold" }
  | { kind: "outside" };

export interface ResolveImageSectionDragHitOptions<T> {
  geometry: ImageSectionDragHitGeometry<T>;
  x: number;
  y: number;
  currentRegionValue: T | null;
  currentIsAppend: boolean;
  equals?: (left: T, right: T) => boolean;
}

// Sortable interactions need a dead zone at target boundaries. A 0.65
// activation core mirrors the common swap-threshold pattern while the pixel
// cap keeps very large portrait cards from requiring an excessive excursion.
const TARGET_ACTIVATION_CORE_RATIO = 0.65;
const MAX_BOUNDARY_HYSTERESIS_PX = 24;
const EDGE_INSET_RATIO = (1 - TARGET_ACTIVATION_CORE_RATIO) / 2;

function dimension(region: ImageSectionDragHitRegion<unknown>, axis: "x" | "y"): number {
  return axis === "x" ? Math.max(0, region.right - region.left) : Math.max(0, region.bottom - region.top);
}

function boundaryInset(size: number): number {
  return Math.min(MAX_BOUNDARY_HYSTERESIS_PX, Math.max(0, size) * EDGE_INSET_RATIO);
}

function contains<T>(region: ImageSectionDragHitRegion<T>, x: number, y: number): boolean {
  return x >= region.left && x <= region.right && y >= region.top && y <= region.bottom;
}

function center<T>(region: ImageSectionDragHitRegion<T>): { x: number; y: number } {
  return {
    x: (region.left + region.right) / 2,
    y: (region.top + region.bottom) / 2,
  };
}

function activatedOnAxis<T>(
  region: ImageSectionDragHitRegion<T>,
  axis: "x" | "y",
  x: number,
  y: number,
): boolean {
  if (axis === "x") {
    const inset = boundaryInset(dimension(region, "x"));
    return x >= region.left + inset && x <= region.right - inset;
  }
  const inset = boundaryInset(dimension(region, "y"));
  return y >= region.top + inset && y <= region.bottom - inset;
}

function switchAxis<T>(
  current: ImageSectionDragHitRegion<T>,
  candidate: ImageSectionDragHitRegion<T>,
): "x" | "y" {
  const currentCenter = center(current);
  const candidateCenter = center(candidate);
  return Math.abs(candidateCenter.x - currentCenter.x) >= Math.abs(candidateCenter.y - currentCenter.y)
    ? "x"
    : "y";
}

function retentionMargin<T>(
  current: ImageSectionDragHitRegion<T> | null,
  regions: ImageSectionDragHitRegion<T>[],
): number {
  const reference = current ?? regions[0] ?? null;
  if (!reference) return 0;
  return Math.min(
    MAX_BOUNDARY_HYSTERESIS_PX,
    Math.min(dimension(reference, "x"), dimension(reference, "y")) * EDGE_INSET_RATIO,
  );
}

function sameValue<T>(left: T, right: T, equals: (left: T, right: T) => boolean): boolean {
  return equals(left, right);
}

function terminalRegionDecision<T>(
  geometry: ImageSectionDragHitGeometry<T>,
  candidate: ImageSectionDragHitRegion<T>,
  y: number,
  currentRegion: ImageSectionDragHitRegion<T> | null,
  currentIsAppend: boolean,
  equals: (left: T, right: T) => boolean,
): ImageSectionDragHitDecision<T> | null {
  const terminalValue = geometry.terminalRegionValue;
  if (terminalValue === null || terminalValue === undefined) return null;
  if (!sameValue(candidate.value, terminalValue, equals)) return null;

  const midpoint = (candidate.top + candidate.bottom) / 2;
  const inset = boundaryInset(dimension(candidate, "y"));
  const appendActivationY = midpoint + inset;
  const beforeActivationY = midpoint - inset;
  const currentIsTerminal = Boolean(currentRegion && sameValue(currentRegion.value, terminalValue, equals));

  // The terminal card owns the otherwise unreachable final insertion slot.
  // Entering its lower core means append; when append is already active, keep
  // it through the midpoint dead zone so a stationary pointer cannot flap back
  // to "before terminal" after the masonry preview reflows.
  if (currentIsAppend) {
    return y <= beforeActivationY ? null : { kind: "hold" };
  }
  if (y >= appendActivationY) return { kind: "append" };
  if (currentIsTerminal) return { kind: "region", region: candidate };
  return null;
}

export function resolveImageSectionDragHit<T>(
  options: ResolveImageSectionDragHitOptions<T>,
): ImageSectionDragHitDecision<T> {
  const { geometry, x, y, currentRegionValue, currentIsAppend } = options;
  const equals = options.equals ?? Object.is;
  const currentRegion = currentRegionValue === null
    ? null
    : geometry.regions.find((region) => sameValue(region.value, currentRegionValue, equals)) ?? null;
  const candidate = geometry.regions.find((region) => contains(region, x, y)) ?? null;
  const margin = retentionMargin(currentRegion, geometry.regions);

  if (candidate) {
    const terminalDecision = terminalRegionDecision(
      geometry,
      candidate,
      y,
      currentRegion,
      currentIsAppend,
      equals,
    );
    if (terminalDecision) return terminalDecision;
    if (currentRegion && sameValue(candidate.value, currentRegion.value, equals)) {
      return { kind: "region", region: candidate };
    }
    if (!currentRegionValue && !currentIsAppend) {
      return { kind: "region", region: candidate };
    }

    const axis = currentRegion ? switchAxis(currentRegion, candidate) : "y";
    return activatedOnAxis(candidate, axis, x, y)
      ? { kind: "region", region: candidate }
      : { kind: "hold" };
  }

  const withinHorizontalRetention = x >= -margin && x <= geometry.width + margin;
  const withinVerticalRetention = y >= -margin && y <= geometry.height + margin;
  const withinSectionRetention = withinHorizontalRetention && withinVerticalRetention;

  if (currentIsAppend) {
    if (withinSectionRetention && y >= geometry.maxBottom - margin) return { kind: "hold" };
    return withinSectionRetention ? { kind: "hold" } : { kind: "outside" };
  }

  if (y > geometry.maxBottom) {
    if (currentRegionValue !== null && y <= geometry.maxBottom + margin && withinHorizontalRetention) {
      return { kind: "hold" };
    }
    if (withinHorizontalRetention && y <= geometry.height + margin) return { kind: "append" };
  }

  if (withinSectionRetention) return { kind: "hold" };
  return { kind: "outside" };
}
