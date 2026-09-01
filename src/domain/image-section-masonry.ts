import { normalizeImageSectionColumns } from "./image-section-layout";

function normalizedItemHeight(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizedGap(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizedAspectRatio(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export interface ImageSectionMasonryPlacement<T> {
  item: T;
  column: number;
  span: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ImageSectionMasonryPlan<T> {
  placements: ImageSectionMasonryPlacement<T>[];
  height: number;
}

export function imageSectionMasonrySpan(
  aspectRatioValue: number,
  columnsValue: unknown,
  minimumSingleColumnHeightRatio = 0.75,
): number {
  const columns = normalizeImageSectionColumns(columnsValue);
  if (columns < 2) return 1;
  const aspectRatio = normalizedAspectRatio(aspectRatioValue);
  const minimumHeightRatio = Number.isFinite(minimumSingleColumnHeightRatio) && minimumSingleColumnHeightRatio > 0
    ? minimumSingleColumnHeightRatio
    : 0.75;
  return 1 / aspectRatio < minimumHeightRatio ? 2 : 1;
}

/**
 * Ordered skyline packing with contiguous column spans.
 *
 * Items retain source order. Each item uses the smallest visual span required
 * by its aspect ratio (currently capped at 2 columns), then lands on the
 * contiguous column window whose skyline has the lowest maximum height.
 */
export function imageSectionMasonryPlan<T>(
  items: readonly T[],
  columnsValue: unknown,
  columnWidthValue: number,
  estimateAspectRatio: (item: T) => number,
  gapValue = 0,
): ImageSectionMasonryPlan<T> {
  const columns = normalizeImageSectionColumns(columnsValue);
  const columnWidth = normalizedItemHeight(columnWidthValue);
  const gap = normalizedGap(gapValue);
  const skyline = Array.from({ length: columns }, () => 0);
  const placements: ImageSectionMasonryPlacement<T>[] = [];
  const itemRatios = items.map((item) => ({ item, aspectRatio: normalizedAspectRatio(estimateAspectRatio(item)) }));
  const wideCandidates = itemRatios.filter(({ aspectRatio }) => imageSectionMasonrySpan(aspectRatio, columns) > 1).length;
  // Multi-column width is useful for occasional landscape frames inside a
  // portrait/square-heavy gallery. Disable it for landscape-heavy galleries,
  // where doubling most items would effectively halve the user's column count.
  const allowWideSpans = wideCandidates > 0 && wideCandidates * 2 < itemRatios.length;

  for (const { item, aspectRatio } of itemRatios) {
    const span = allowWideSpans
      ? Math.min(columns, imageSectionMasonrySpan(aspectRatio, columns))
      : 1;
    let bestColumn = 0;
    let bestTop = Number.POSITIVE_INFINITY;
    let bestSkylineSum = Number.POSITIVE_INFINITY;

    for (let column = 0; column <= columns - span; column += 1) {
      const window = skyline.slice(column, column + span);
      const top = Math.max(...window);
      const skylineSum = window.reduce((sum, height) => sum + height, 0);
      if (top < bestTop || (top === bestTop && skylineSum < bestSkylineSum)) {
        bestColumn = column;
        bestTop = top;
        bestSkylineSum = skylineSum;
      }
    }

    const width = columnWidth * span + gap * Math.max(0, span - 1);
    const height = width / aspectRatio;
    const placement = {
      item,
      column: bestColumn,
      span,
      left: bestColumn * (columnWidth + gap),
      top: bestTop,
      width,
      height,
    };
    placements.push(placement);
    const nextHeight = bestTop + height + gap;
    for (let column = bestColumn; column < bestColumn + span; column += 1) skyline[column] = nextHeight;
  }

  const height = placements.length ? Math.max(...skyline) - gap : 0;
  return { placements, height: Math.max(0, height) };
}

export function imageSectionShortestColumnBuckets<T>(
  items: readonly T[],
  columnsValue: unknown,
  estimateHeight: (item: T) => number,
  gapValue = 0,
): T[][] {
  const columns = normalizeImageSectionColumns(columnsValue);
  const buckets = Array.from({ length: columns }, () => [] as T[]);
  const heights = Array.from({ length: columns }, () => 0);
  const gap = normalizedGap(gapValue);

  for (const item of items) {
    let shortest = 0;
    for (let index = 1; index < columns; index += 1) {
      if (heights[index] < heights[shortest]) shortest = index;
    }

    if (buckets[shortest].length > 0) heights[shortest] += gap;
    buckets[shortest].push(item);
    heights[shortest] += normalizedItemHeight(estimateHeight(item));
  }

  return buckets;
}
