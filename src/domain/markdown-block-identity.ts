/**
 * Resolve a writable fenced block using its unchanged raw content.
 *
 * Prefer unique content identity, allowing edits elsewhere in the note to
 * shift the target. If two equal-content blocks already exist, permit the
 * current block only when its exact start/end position still matches the
 * provided locator; never resolve by a merely containing or nearest line.
 * Position fallback is best-effort: without a persistent block ID there is
 * no perfect distinction between two identical blocks after arbitrary edits.
 *
 * Compare raw content (not reserialized fields) so new YAML comments and
 * extension metadata cannot be silently discarded by an old editor.
 */
export function locateUnchangedMarkdownBlock<
  Block extends { readonly source: string; readonly lineStart: number; readonly lineEnd: number },
>(
  blocks: readonly Block[],
  locator: { readonly source: string; readonly lineStart?: number; readonly lineEnd?: number },
  kind: string,
): Block {
  const normalize = (source: string): string => source.replace(/\r\n/g, "\n").trim();
  const expected = normalize(locator.source);
  const matches = blocks.filter((block) => normalize(block.source) === expected);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1 && typeof locator.lineStart === "number") {
    const exact = matches.filter((block) => (
      block.lineStart === locator.lineStart
      && (typeof locator.lineEnd !== "number" || block.lineEnd === locator.lineEnd)
    ));
    if (exact.length === 1) return exact[0];
  }
  throw new Error(`Could not safely locate the unchanged ${kind} block; reopen the note and retry.`);
}
