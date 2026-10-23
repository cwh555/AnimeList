import type { App } from "obsidian";
import { getAllMarkdownFiles } from "./vault-scope";

interface MarkdownRevision {
  mtime: number;
  size: number;
}

/**
 * A cheap, conservative guard around explicit destructive cleanup.
 * Detects new/deleted/renamed notes and note edits while reference collection
 * or trashing is in progress. Does not claim transactional locking across
 * multiple Obsidian devices.
 */
export class VaultMarkdownRevisionGuard {
  private readonly revisions: ReadonlyMap<string, MarkdownRevision>;

  constructor(private readonly app: App) {
    const initial = new Map<string, MarkdownRevision>();
    for (const note of getAllMarkdownFiles(app)) {
      initial.set(note.path, { mtime: note.stat.mtime, size: note.stat.size });
    }
    this.revisions = initial;
  }

  assertUnchanged(): void {
    const files = getAllMarkdownFiles(this.app);
    if (files.length !== this.revisions.size) this.changed();
    for (const note of files) {
      const original = this.revisions.get(note.path);
      if (!original || original.mtime !== note.stat.mtime || original.size !== note.stat.size) {
        this.changed();
      }
    }
  }

  private changed(): never {
    throw new Error("Markdown changed during media cleanup. Cleanup stopped; run it again after edits and sync finish.");
  }
}
