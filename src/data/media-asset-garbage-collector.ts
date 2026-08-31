import { TAbstractFile, TFile, normalizePath, type App } from "obsidian";
import type { AnimeListSettings } from "../domain/settings-types";
import {
  managedMediaAssetKind,
  normalizeMediaAssetPath,
  shouldRemoveManagedMediaAsset,
  type MediaAssetCleanupResult,
} from "../domain/media-asset-cleanup";
import { imageSectionRootFromCoverFolder } from "../domain/image-section";
import { MediaAssetReferenceService, type MediaAssetReferenceSnapshot } from "./media-asset-reference-service";
import { moveAdapterFileToVaultTrash } from "./vault-trash";

export interface MediaAssetGarbageCollectionExecution {
  result: MediaAssetCleanupResult;
  references: MediaAssetReferenceSnapshot;
}

function hasChildren(entry: TAbstractFile): entry is TAbstractFile & { children: TAbstractFile[] } {
  return "children" in entry && Array.isArray(entry.children);
}

function collectFiles(entry: TAbstractFile, output: TFile[]): void {
  if (entry instanceof TFile) {
    output.push(entry);
    return;
  }
  if (hasChildren(entry)) {
    for (const child of entry.children) collectFiles(child, output);
  }
}

export class MediaAssetGarbageCollector {
  private readonly references: MediaAssetReferenceService;

  constructor(
    private readonly app: App,
    private readonly pluginId: string,
    private readonly settings: () => AnimeListSettings,
  ) {
    this.references = new MediaAssetReferenceService(app, settings);
  }

  async cleanup(leasedPaths: ReadonlySet<string> = new Set()): Promise<MediaAssetGarbageCollectionExecution> {
    const references = await this.references.collect();
    const leases = new Set([...leasedPaths].map(normalizeMediaAssetPath).filter(Boolean));
    let removedManagedFiles = 0;
    for (const file of this.candidateFiles()) {
      if (!shouldRemoveManagedMediaAsset(file.path, this.settings().coverFolder, references.referencedPaths, leases)) continue;
      await this.app.fileManager.trashFile(file);
      removedManagedFiles += 1;
    }
    const removedJournalFiles = await this.cleanupImageOrderJournals();
    return {
      result: { removedManagedFiles, removedJournalFiles, removedCacheFiles: 0 },
      references,
    };
  }

  private candidateFiles(): TFile[] {
    const output: TFile[] = [];
    const coverRoot = normalizeMediaAssetPath(this.settings().coverFolder);
    const imageRoot = imageSectionRootFromCoverFolder(coverRoot);
    for (const root of [coverRoot, imageRoot]) {
      const entry = this.app.vault.getAbstractFileByPath(root);
      if (entry) collectFiles(entry, output);
    }
    const unique = new Map<string, TFile>();
    for (const file of output) {
      if (managedMediaAssetKind(file.path, coverRoot)) unique.set(file.path, file);
    }
    return [...unique.values()];
  }

  private async cleanupImageOrderJournals(): Promise<number> {
    const root = normalizePath(`${this.app.vault.configDir}/plugins/${this.pluginId}/state/image-order`);
    const adapter = this.app.vault.adapter;
    if (!await adapter.exists(root)) return 0;
    const listing = await adapter.list(root);
    let removed = 0;
    const decoder = new TextDecoder();
    for (const path of listing.files.filter((value) => value.toLocaleLowerCase().endsWith(".json"))) {
      let sourcePath = "";
      try {
        const raw = JSON.parse(decoder.decode(await adapter.readBinary(path))) as unknown;
        if (raw && typeof raw === "object" && "sourcePath" in raw && typeof raw.sourcePath === "string") {
          sourcePath = normalizePath(raw.sourcePath).replace(/^\/+/, "");
        }
      } catch {
        sourcePath = "";
      }
      const source = sourcePath ? this.app.vault.getAbstractFileByPath(sourcePath) : null;
      if (source instanceof TFile && source.extension === "md") continue;
      if (await moveAdapterFileToVaultTrash(adapter, path, "image-order")) removed += 1;
    }
    return removed;
  }
}
