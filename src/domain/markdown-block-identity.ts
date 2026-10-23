/**
 * Resolve a writable fenced block using its unchanged raw content.
 *
 * Line hints are not identities. When two identical sections exist, another
 * identical section could occupy the old line after a concurrent edit.
 * Reject ambiguous targets even when a line hint happens to match.
 *
 * Compare raw contents rather than reserialized known fields so newly added
 * YAML comments, extension metadata and manually authored lines are not
 * silently discarded by a stale edit. Normalize line endings and outer
 * padding for Obsidian code-block renderer compatibility.
 */
export function locateUnchangedMarkdownBlock<Block extends { readonly source: string }>(
  blocks: readonly Block[],
  locator: { readonly source: string },
  kind: string,
): Block {
  const normalize = (source: string): string => source.replace(/\r\n/g, "\n").trim();
  const expected = normalize(locator.source);
  const matches = blocks.filter((block) => normalize(block.source) === expected);
  if (matches.length === 1) return matches[0];
  throw new Error(`Could not safely locate the unchanged ${kind} block; reopen the note and retry.`);
}
