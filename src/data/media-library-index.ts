import type { App, TFile } from "obsidian";
import type { MediaItem } from "../domain/media-types";
import { pathBelongsToLibraryRoot } from "./library-change-scope";
import type { MediaRepository } from "./media-repository";
import { getScopedMarkdownFiles } from "./vault-scope";

function rootsKey(roots: readonly string[]): string {
  return [...roots].sort().join("\u0000");
}

export class MediaLibraryIndex {
  private readonly items = new Map<string, MediaItem>();
  private activeRootsKey = "";
  private initialized = false;

  constructor(
    private readonly app: App,
    private readonly repository: MediaRepository,
  ) {}

  snapshot(roots: string[]): MediaItem[] {
    const key = rootsKey(roots);
    if (!this.initialized || this.activeRootsKey !== key) this.rebuild(roots, key);
    return [...this.items.values()];
  }

  update(file: TFile, roots: string[]): void {
    if (!this.initialized) return;
    const key = rootsKey(roots);
    if (this.activeRootsKey !== key) {
      this.invalidate();
      return;
    }
    if (!roots.some((root) => pathBelongsToLibraryRoot(file.path, root))) {
      this.items.delete(file.path);
      return;
    }
    const item = this.repository.read(file);
    if (item) this.items.set(file.path, item);
    else this.items.delete(file.path);
  }

  remove(path: string): void {
    if (this.initialized) this.items.delete(path);
  }

  rename(oldPath: string, file: TFile | null, roots: string[]): void {
    if (!this.initialized) return;
    const key = rootsKey(roots);
    if (this.activeRootsKey !== key) {
      this.invalidate();
      return;
    }

    const previous = this.items.get(oldPath);
    this.items.delete(oldPath);
    if (!file || !roots.some((root) => pathBelongsToLibraryRoot(file.path, root))) return;

    if (previous) {
      // A vault rename changes identity-by-path, not the note's media data. Keep
      // the already verified item alive immediately instead of re-reading the
      // metadata cache during the rename callback: Obsidian may move the TFile
      // before its metadata cache entry is available at the new path.
      this.items.set(file.path, { ...previous, filePath: file.path });
      return;
    }

    // The renamed file was not part of the initialized index (for example a
    // note moved into a configured root). Rebuild from the canonical vault on
    // the next snapshot rather than treating rename-event metadata as final.
    this.invalidate();
  }

  invalidate(): void {
    this.initialized = false;
    this.activeRootsKey = "";
    this.items.clear();
  }

  private rebuild(roots: string[], key: string): void {
    this.items.clear();
    for (const file of getScopedMarkdownFiles(this.app, roots)) {
      const item = this.repository.read(file);
      if (item) this.items.set(file.path, item);
    }
    this.activeRootsKey = key;
    this.initialized = true;
  }
}
