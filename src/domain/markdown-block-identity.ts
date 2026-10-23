/**
 * Resolve an editable fenced block against the current Markdown.
 *
 * A line hint is never sufficient evidence of identity: edits above a block
 * can move it or make that line point into a different section. Resolve by
 * the original normalized block content, using the hint only to disambiguate
 * multiple equal-content blocks. When ambiguous, preserve the user's file.
 */
export function locateUnchangedMarkdownBlock<
  Block extends { readonly source: string; readonly lineStart: number; readonly lineEnd: number },
>(
  blocks: readonly Block[],
  locator: { readonly source: string; readonly lineStart?: number },
  sameSource: (left: string, right: string) => boolean,
  kind: string,
): Block {
  const matches = blocks.filter((block) => sameSource(block.source, locator.source));
  const hint = typeof locator.lineStart === "number" ? locator.lineStart : null;
  if (hint !== null) {
    const hinted = matches.filter((block) => hint >= block.lineStart && hint <= block.lineEnd);
    if (hinted.length === 1) return hinted[0];
  }
  if (matches.length === 1) return matches[0];
  throw new Error(`Could not safely locate the unchanged ${kind} block; reopen the note and retry.`);
}
