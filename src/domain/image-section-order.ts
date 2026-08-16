import {
  findImageSectionBlocks,
  locateImageSectionBlock,
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

export interface ImageSectionMoveUpdate {
  markdown: string;
  sourceSection: ImageSectionStateUpdate;
  targetSection: ImageSectionStateUpdate;
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

function blockIndex(blocks: readonly ImageSectionBlock[], block: ImageSectionBlock): number {
  const index = blocks.findIndex((candidate) => (
    candidate.lineStart === block.lineStart && candidate.lineEnd === block.lineEnd
  ));
  if (index < 0) throw new Error("Could not safely identify this image section");
  return index;
}

function replaceBlockPaths(lines: string[], block: ImageSectionBlock, paths: readonly string[]): void {
  const source = serializeImageSectionPaths(paths);
  const replacement = [lines[block.lineStart], ...(source ? source.split("\n") : []), lines[block.lineEnd]];
  lines.splice(block.lineStart, block.lineEnd - block.lineStart + 1, ...replacement);
}

function stateFor(block: ImageSectionBlock): ImageSectionStateUpdate {
  return { source: block.source, lineStart: block.lineStart, lineEnd: block.lineEnd };
}

export function moveImageSectionPath(
  markdown: unknown,
  sourceLocator: ImageSectionLocator,
  targetLocator: ImageSectionLocator,
  movingPathValue: unknown,
  targetPathValue: unknown,
  placement: ImageSectionDropPlacement,
): ImageSectionMoveUpdate {
  const text = typeof markdown === "string" ? markdown : "";
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const blocks = findImageSectionBlocks(text);
  const sourceBlock = locateImageSectionBlock(text, sourceLocator);
  const targetBlock = locateImageSectionBlock(text, targetLocator);
  const sourceIndex = blockIndex(blocks, sourceBlock);
  const targetIndex = blockIndex(blocks, targetBlock);
  const movingPath = normalizeImageSectionPath(movingPathValue);
  const targetPath = normalizeImageSectionPath(targetPathValue);

  if (!movingPath || !sourceBlock.paths.includes(movingPath)) {
    throw new Error("Could not find the dragged image in its source section");
  }

  const lines = text.split(/\r?\n/u);
  if (sourceIndex === targetIndex) {
    const nextPaths = reorderImageSectionPaths(sourceBlock.paths, movingPath, targetPath, placement);
    replaceBlockPaths(lines, sourceBlock, nextPaths);
  } else {
    const nextSourcePaths = sourceBlock.paths.filter((path) => path !== movingPath);
    const targetWithoutMoving = targetBlock.paths.filter((path) => path !== movingPath);
    let nextTargetPaths: string[];
    if (placement === "append" || !targetPath) {
      nextTargetPaths = [...targetWithoutMoving, movingPath];
    } else {
      const targetPosition = targetWithoutMoving.indexOf(targetPath);
      const insertAt = targetPosition < 0
        ? targetWithoutMoving.length
        : targetPosition + (placement === "after" ? 1 : 0);
      nextTargetPaths = [...targetWithoutMoving];
      nextTargetPaths.splice(insertAt, 0, movingPath);
    }

    const replacements = [
      { block: sourceBlock, paths: nextSourcePaths },
      { block: targetBlock, paths: nextTargetPaths },
    ].sort((left, right) => right.block.lineStart - left.block.lineStart);
    for (const replacement of replacements) replaceBlockPaths(lines, replacement.block, replacement.paths);
  }

  const updatedMarkdown = lines.join(newline);
  const updatedBlocks = findImageSectionBlocks(updatedMarkdown);
  const updatedSource = updatedBlocks[sourceIndex];
  const updatedTarget = updatedBlocks[targetIndex];
  if (!updatedSource || !updatedTarget) throw new Error("Could not verify the updated image sections");
  return {
    markdown: updatedMarkdown,
    sourceSection: stateFor(updatedSource),
    targetSection: stateFor(updatedTarget),
  };
}
