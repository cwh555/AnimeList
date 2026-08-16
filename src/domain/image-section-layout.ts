import { locateImageSectionBlock, type ImageSectionLocator } from "./image-section";

export const DEFAULT_IMAGE_SECTION_COLUMNS = 4;
export const MIN_IMAGE_SECTION_COLUMNS = 1;
export const MAX_IMAGE_SECTION_COLUMNS = 6;

export function normalizeImageSectionColumns(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_IMAGE_SECTION_COLUMNS;
  return Math.min(MAX_IMAGE_SECTION_COLUMNS, Math.max(MIN_IMAGE_SECTION_COLUMNS, Math.round(numeric)));
}

export function parseImageSectionColumns(sectionText: unknown): number {
  const opening = (typeof sectionText === "string" ? sectionText : "").split(/\r?\n/, 1)[0] ?? "";
  const match = /(?:^|\s)columns=(\d+)(?=\s|$)/u.exec(opening);
  return match ? normalizeImageSectionColumns(match[1]) : DEFAULT_IMAGE_SECTION_COLUMNS;
}

export function imageSectionColumnBuckets<T>(items: readonly T[], columnsValue: unknown): T[][] {
  const columns = normalizeImageSectionColumns(columnsValue);
  const buckets = Array.from({ length: columns }, () => [] as T[]);
  items.forEach((item, index) => buckets[index % columns].push(item));
  return buckets;
}

export function effectiveImageSectionColumns(preferredValue: unknown, widthValue: unknown): number {
  const preferred = normalizeImageSectionColumns(preferredValue);
  const width = typeof widthValue === "number" ? widthValue : Number(widthValue);
  if (!Number.isFinite(width) || width <= 0) return preferred;
  if (width <= 360) return 1;
  if (width <= 620) return Math.min(preferred, 2);
  if (width <= 740) return Math.min(preferred, 3);
  return preferred;
}

function openingFenceWithColumns(openingFence: string, columnsValue: unknown): string {
  const columns = normalizeImageSectionColumns(columnsValue);
  const match = /^(\s*```animelist-images)(.*?)(\s*)$/u.exec(openingFence);
  if (!match) throw new Error("Could not update image section layout metadata");
  const [, prefix, rawSuffix, trailingWhitespace] = match;
  const tokens = rawSuffix.trim().split(/\s+/u).filter(Boolean).filter((token) => !/^columns=/u.test(token));
  if (columns !== DEFAULT_IMAGE_SECTION_COLUMNS) tokens.push(`columns=${columns}`);
  return `${prefix}${tokens.length ? ` ${tokens.join(" ")}` : ""}${trailingWhitespace}`;
}

export function setImageSectionColumns(
  markdown: unknown,
  locator: ImageSectionLocator,
  columnsValue: unknown,
): string {
  const text = typeof markdown === "string" ? markdown : "";
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/u);
  const block = locateImageSectionBlock(text, locator);
  lines[block.lineStart] = openingFenceWithColumns(lines[block.lineStart], columnsValue);
  return lines.join(newline);
}
