import {
  findImageSectionBlocks,
  normalizeImageSectionPath,
  serializeImageSectionPaths,
  type ImageSectionBlock,
  type ImageSectionLocator,
} from "./image-section";

export type ImageSectionDropPlacement = "before" | "after" | "append";

export interface ImageSectionStateUpdate {
  source: string;
  lineStart: number;
  lineEnd: number;
}

export interface ImageSectionOrderReplacement {
  locator: ImageSectionLocator;
  expectedPaths: readonly string[];
  paths: readonly string[];
}

export interface ImageSectionOrderBatchUpdate {
  markdown: string;
  sections: ImageSectionStateUpdate[];
}

export interface ImageSectionPathMovePlan {
  sourcePaths: string[];
  targetPaths: string[];
  changed: boolean;
}

function samePathOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

export function reorderImageSectionPaths(
  paths: readonly string[],
  movingPathValue: unknown,
  targetPathValue: unknown,
  placement: ImageSectionDropPlacement,
): string[] {
  const movingPath = normalizeImageSectionPath(movingPathValue);
  const targetPath = normalizeImageSectionPath(targetPathValue);
  const current = [...paths];
  const sourceIndex = current.indexOf(movingPath);
  if (!movingPath || sourceIndex < 0) return current;
  if (targetPath === movingPath) return current;

  const next = current.filter((path) => path !== movingPath);
  if (placement === "append" || !targetPath) return [...next, movingPath];
  const targetIndex = next.indexOf(targetPath);
  if (targetIndex < 0) return [...next, movingPath];
  const insertAt = placement === "after" ? targetIndex + 1 : targetIndex;
  next.splice(insertAt, 0, movingPath);
  return next;
}

export function planImageSectionPathMove(
  sourcePaths: readonly string[],
  targetPaths: readonly string[],
  movingPathValue: unknown,
  targetPathValue: unknown,
  placement: ImageSectionDropPlacement,
  sameSection: boolean,
): ImageSectionPathMovePlan {
  const movingPath = normalizeImageSectionPath(movingPathValue);
  const targetPath = normalizeImageSectionPath(targetPathValue);
  const sourceBefore = [...sourcePaths];
  const targetBefore = sameSection ? sourceBefore : [...targetPaths];
  if (!movingPath || !sourceBefore.includes(movingPath)) {
    return { sourcePaths: sourceBefore, targetPaths: targetBefore, changed: false };
  }

  if (sameSection) {
    const next = reorderImageSectionPaths(sourceBefore, movingPath, targetPath, placement);
    return { sourcePaths: next, targetPaths: next, changed: !samePathOrder(sourceBefore, next) };
  }

  const nextSource = sourceBefore.filter((path) => path !== movingPath);
  const targetWithoutMoving = targetBefore.filter((path) => path !== movingPath);
  const nextTarget = reorderImageSectionPaths(
    [...targetWithoutMoving, movingPath],
    movingPath,
    targetPath,
    placement,
  );
  return {
    sourcePaths: nextSource,
    targetPaths: nextTarget,
    changed: !samePathOrder(sourceBefore, nextSource) || !samePathOrder(targetBefore, nextTarget),
  };
}

function blockIndex(blocks: readonly ImageSectionBlock[], block: ImageSectionBlock): number {
  const index = blocks.findIndex((candidate) => (
    candidate.lineStart === block.lineStart && candidate.lineEnd === block.lineEnd
  ));
  if (index < 0) throw new Error("Could not safely identify this image section");
  return index;
}

function locateExpectedOrderBlock(
  markdown: string,
  locator: ImageSectionLocator,
  expectedPaths: readonly string[],
): ImageSectionBlock {
  const blocks = findImageSectionBlocks(markdown);
  const hint = typeof locator.lineStart === "number" ? locator.lineStart : null;
  const containing = hint === null
    ? null
    : blocks.find((block) => hint >= block.lineStart && hint <= block.lineEnd) ?? null;
  if (containing && samePathOrder(containing.paths, expectedPaths)) return containing;

  const matches = blocks.filter((block) => samePathOrder(block.paths, expectedPaths));
  if (matches.length === 1) return matches[0];
  if (hint !== null && matches.length > 1) {
    return [...matches].sort((left, right) => (
      Math.abs(left.lineStart - hint) - Math.abs(right.lineStart - hint)
    ))[0];
  }
  throw new Error("Image section changed before the pending order could be saved");
}

function replaceBlockPaths(lines: string[], block: ImageSectionBlock, paths: readonly string[]): void {
  const source = serializeImageSectionPaths(paths);
  const replacement = [lines[block.lineStart], ...(source ? source.split("\n") : []), lines[block.lineEnd]];
  lines.splice(block.lineStart, block.lineEnd - block.lineStart + 1, ...replacement);
}

function stateFor(block: ImageSectionBlock): ImageSectionStateUpdate {
  return { source: block.source, lineStart: block.lineStart, lineEnd: block.lineEnd };
}

export function replaceImageSectionOrders(
  markdown: unknown,
  replacements: readonly ImageSectionOrderReplacement[],
): ImageSectionOrderBatchUpdate {
  const text = typeof markdown === "string" ? markdown : "";
  if (replacements.length === 0) return { markdown: text, sections: [] };

  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const blocks = findImageSectionBlocks(text);
  const indexed = replacements.map((replacement) => {
    const block = locateExpectedOrderBlock(text, replacement.locator, replacement.expectedPaths);
    return {
      index: blockIndex(blocks, block),
      block,
      paths: [...replacement.paths],
    };
  });
  const seen = new Set<number>();
  for (const entry of indexed) {
    if (seen.has(entry.index)) throw new Error("Image section order batch contains the same section twice");
    seen.add(entry.index);
  }

  const lines = text.split(/\r?\n/u);
  for (const entry of [...indexed].sort((left, right) => right.block.lineStart - left.block.lineStart)) {
    replaceBlockPaths(lines, entry.block, entry.paths);
  }

  const updatedMarkdown = lines.join(newline);
  const updatedBlocks = findImageSectionBlocks(updatedMarkdown);
  const sections = indexed.map(({ index }) => {
    const block = updatedBlocks[index];
    if (!block) throw new Error("Could not verify the updated image section order");
    return stateFor(block);
  });
  return { markdown: updatedMarkdown, sections };
}
