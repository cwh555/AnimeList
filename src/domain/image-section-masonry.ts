import { normalizeImageSectionColumns } from "./image-section-layout";

function normalizedItemHeight(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizedGap(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
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
