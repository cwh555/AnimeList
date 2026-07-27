import { Notice, type App, type TFile } from "obsidian";
import type { CoverThumbnailCache } from "../cover-cache";
import type { MediaRepository } from "../data/media-repository";
import { uiText } from "../ui-text";
import { getScopedMarkdownFiles } from "../vault-scope";

export interface CoverMaintenanceHost {
  readonly app: App;
  scanFolders(): string[];
  repository(): MediaRepository;
  cache(): CoverThumbnailCache | undefined;
  refreshViews(): void;
}

export class CoverMaintenance {
  constructor(private readonly host: CoverMaintenanceHost) {}

  private localCoverFiles(): TFile[] {
    const unique = new Map<string, TFile>();
    for (const note of getScopedMarkdownFiles(this.host.app, this.host.scanFolders())) {
      const frontmatter = this.host.app.metadataCache.getFileCache(note)?.frontmatter;
      const cover = this.host.repository().resolveCoverFile(frontmatter?.cover, note.path);
      if (cover) unique.set(cover.path, cover);
    }
    return [...unique.values()];
  }

  async optimize(): Promise<void> {
    const files = this.localCoverFiles();
    if (!files.length) {
      new Notice(uiText("notice.coverOptimizeEmpty"));
      return;
    }
    const cache = this.host.cache();
    if (!cache) throw new Error("Cover cache is not initialized");
    const progress = new Notice(
      uiText("notice.coverOptimizeProgress", { completed: 0, total: files.length }),
      0,
    );
    const result = await cache.optimizeFiles(files, (completed, total) => {
      progress.setMessage(uiText("notice.coverOptimizeProgress", { completed, total }));
    });
    progress.setMessage(uiText("notice.coverOptimizeDone", result));
    window.setTimeout(() => progress.hide(), 5000);
    this.host.refreshViews();
  }

  async clear(): Promise<void> {
    const cache = this.host.cache();
    if (!cache) throw new Error("Cover cache is not initialized");
    const removed = await cache.clear();
    new Notice(uiText("notice.coverCacheCleared", { removed }));
    this.host.refreshViews();
  }
}
