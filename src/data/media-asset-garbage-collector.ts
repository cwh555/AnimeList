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
import { VaultMarkdownRevisionGuard } from "./vault-markdown-revision-guard";

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
    // Capture the note set before asynchronous disk reads. If any Markdown is
    // changed or newly created during cleanup, stop rather than act on a stale
    // reference snapshot. This guard is intentionally conservative.
    const revision = new VaultMarkdownRevisionGuard(this.app);
    const references = await this.references.collect({ freshRead: true });
    revision.assertUnchanged();
    const leases = new Set([...leasedPaths].map(normalizeMediaAssetPath).filter(Boolean));
    let removedManagedFiles = 0;
    for (const file of this.candidateFiles()) {
      if (!shouldRemoveManagedMediaAsset(file.path, this.settings().coverFolder, references.referencedPaths, leases)) continue;
      revision.assertUnchanged();
      // The same path may have been replaced by another file since enumeration.
      if (this.app.vault.getAbstractFileByPath(file.path) !== file) continue;
      await this.app.fileManager.trashFile(file);
      removedManagedFiles += 1;
    }
    revision.assertUnchanged();
    const removedJournalFiles = await this.cleanupImageOrderJournals(revision);
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

  private async cleanupImageOrderJournals(revision: VaultMarkdownRevisionGuard): Promise<number> {
    const root = normalizePath(`${this.app.vault.configDir}/plugins/${this.pluginId}/state/image-order`);
    const adapter = this.app.vault.adapter;
    if (!await adapter.exists(root)) return 0;
    const listing = await adapter.list(root);
    let removed = 0;
    const decoder = new TextDecoder();
    for (const path of listing.files.filter((value) => value.toLocaleLowerCase().endsWith(".json"))) {
      revision.assertUnchanged();
      let sourcePath = "";
      let originalBytes: ArrayBuffer;
      try {
        originalBytes = await adapter.readBinary(path);
        const raw = JSON.parse(decoder.decode(originalBytes)) as unknown;
        if (raw && typeof raw === "object" && "sourcePath" in raw && typeof raw.sourcePath === "string") {
          sourcePath = normalizePath(raw.sourcePath).replace(/^\/+/, "");
        }
      } catch {
        sourcePath = "";
      }
      const source = sourcePath ? this.app.vault.getAbstractFileByPath(sourcePath) : null;
      if (source instanceof TFile && source.extension === "md") continue;
      revision.assertUnchanged();
      // A journal can be rewritten by the ordering session while cleanup
      // enumerates entries. Keep the newer version for recovery instead of
      // moving a stale path out from under the session.
      if (!(await adapter.exists(path))) continue;
      const latest = new Uint8Array(await adapter.readBinary(path));
      const original = new Uint8Array(originalBytes);
      if (latest.length !== original.length || latest.some((byte, index) => byte !== original[index])) continue;
      revision.assertUnchanged();
      if (await moveAdapterFileToVaultTrash(adapter, path, "image-order")) removed += 1;
    }
    return removed;
  }
}
