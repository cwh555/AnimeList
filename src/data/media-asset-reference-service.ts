import { TFile, normalizePath, type App } from "obsidian";
import type { AnimeListSettings } from "../domain/settings-types";
import { managedMediaAssetKind, normalizeMediaAssetPath } from "../domain/media-asset-cleanup";
import { extractFrontmatterCoverTargets, extractMarkdownAssetTargets } from "../domain/media-asset-references";
import { getAllMarkdownFiles } from "./vault-scope";

const REFERENCE_READ_CONCURRENCY = 8;

export interface MediaAssetReferenceSnapshot {
  referencedPaths: Set<string>;
  referencedFiles: TFile[];
  coverFiles: TFile[];
  imageFiles: TFile[];
}

export class MediaAssetReferenceService {
  constructor(
    private readonly app: App,
    private readonly settings: () => AnimeListSettings,
  ) {}

  async collect(): Promise<MediaAssetReferenceSnapshot> {
    const referencedPaths = new Set<string>();
    const notes = getAllMarkdownFiles(this.app);
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < notes.length) {
        const note = notes[cursor++];
        if (!note) continue;
        const markdown = await this.app.vault.cachedRead(note);
        const frontmatter = this.app.metadataCache.getFileCache(note)?.frontmatter;
        const targets = new Set([
          ...extractMarkdownAssetTargets(markdown),
          ...extractFrontmatterCoverTargets(frontmatter),
        ]);
        for (const target of targets) {
          const file = this.resolveTarget(target, note.path);
          if (file) referencedPaths.add(normalizeMediaAssetPath(file.path));
        }
      }
    };
    const workerCount = Math.min(REFERENCE_READ_CONCURRENCY, notes.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const referencedFiles: TFile[] = [];
    const coverFiles: TFile[] = [];
    const imageFiles: TFile[] = [];
    for (const path of referencedPaths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      referencedFiles.push(file);
      const kind = managedMediaAssetKind(path, this.settings().coverFolder);
      if (kind === "cover") coverFiles.push(file);
      else if (kind === "image") imageFiles.push(file);
    }
    return { referencedPaths, referencedFiles, coverFiles, imageFiles };
  }

  private resolveTarget(value: string, sourcePath: string): TFile | null {
    const target = value.trim();
    if (!target || /^(?:https?:|data:|app:)/i.test(target)) return null;
    const linked = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
    if (linked instanceof TFile) return linked;
    const normalized = normalizePath(target).replace(/^\/+/, "");
    const direct = this.app.vault.getAbstractFileByPath(normalized);
    return direct instanceof TFile ? direct : null;
  }
}