import { Notice, TFile, normalizePath, requestUrl, type App } from "obsidian";
import type { CoverSources } from "../types";
import type { AnimeListSettings } from "../domain/settings-types";
import {
  imageBaseName,
  imageContentHash,
  imageContentTypeForPath,
  imageExtensionFor,
  imageSectionFolderForNote,
  imageSectionRootFromCoverFolder,
  locateImageSectionBlock,
  normalizeImageSectionPath,
  parseImageSectionSource,
  replaceImageSectionPaths,
  serializeImageSectionPaths,
  type ImageSectionLocator,
} from "../domain/image-section";
import { setImageSectionColumns } from "../domain/image-section-layout";
import {
  moveImageSectionPath,
  type ImageSectionDropPlacement,
  type ImageSectionMoveUpdate,
  type ImageSectionStateUpdate,
} from "../domain/image-section-order";
import { allManagedImageReferences } from "../domain/media-image-references";
import { mediaTypeOf, normalizedCoverPath, stringValue } from "../domain/value-normalization";
import { visualImageFingerprint } from "./image-raster";

export interface ImageSectionHost {
  app: App;
  settings: AnimeListSettings;
  ensureFolder(path: string): Promise<void>;
  uniqueFilePath(folder: string, baseName: string, extension: string): Promise<string>;
  getImageThumbnailSources(file: TFile): CoverSources | undefined;
  refreshViews(): void;
}

export interface ImageSectionAssetInput {
  name: string;
  data: ArrayBuffer;
  contentType?: string;
}

export interface ImageSectionAddResult {
  source: string;
  added: number;
  duplicatesSkipped: number;
}

export interface StoredImageAssetsResult {
  paths: string[];
  addedPaths: string[];
  duplicatesSkipped: number;
  acceptedAssetIndexes: number[];
}

export interface ResolvedImageSectionAsset {
  path: string;
  resourcePath: string;
  thumbnailSources?: CoverSources;
  file: TFile | null;
  remote: boolean;
}

function findSectionState(markdown: string, locator: ImageSectionLocator): ImageSectionStateUpdate {
  const block = locateImageSectionBlock(markdown, locator);
  return { source: block.source, lineStart: block.lineStart, lineEnd: block.lineEnd };
}

function isManagedPath(path: string, root: string): boolean {
  const cleanPath = normalizePath(path).replace(/^\/+/, "");
  const cleanRoot = normalizePath(root).replace(/^\/+|\/+$/g, "");
  return cleanPath === cleanRoot || cleanPath.startsWith(`${cleanRoot}/`);
}

function remoteFilename(url: string): string {
  try {
    const parsed = new URL(url);
    const encoded = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(encoded) || "image";
  } catch {
    return "image";
  }
}

export async function imageAssetFromFile(file: File): Promise<ImageSectionAssetInput> {
  return {
    name: file.name || "image",
    data: await file.arrayBuffer(),
    contentType: file.type,
  };
}

export class ImageSectionService {
  private readonly fingerprintCache = new Map<string, { size: number; mtime: number; binary: string; visual?: string }>();

  constructor(private readonly host: ImageSectionHost) {}

  resolve(pathValue: unknown, sourcePath: string): ResolvedImageSectionAsset {
    const path = normalizeImageSectionPath(pathValue);
    if (/^https?:\/\//i.test(path)) {
      return { path, resourcePath: path, file: null, remote: true };
    }
    const file = this.host.app.metadataCache.getFirstLinkpathDest(path, sourcePath)
      ?? this.host.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return { path, resourcePath: "", file: null, remote: false };
    return {
      path,
      resourcePath: this.host.app.vault.getResourcePath(file),
      thumbnailSources: this.host.getImageThumbnailSources(file),
      file,
      remote: false,
    };
  }

  async fetchRemoteAsset(urlValue: unknown): Promise<ImageSectionAssetInput> {
    const url = stringValue(urlValue).trim();
    if (!/^https?:\/\//i.test(url)) throw new Error("Enter a valid http(s) image URL");
    const response = await requestUrl({
      url,
      method: "GET",
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*" },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Image request failed (${response.status})`);
    }
    const contentType = Object.entries(response.headers ?? {})
      .find(([key]) => key.toLocaleLowerCase() === "content-type")?.[1] ?? "";
    const name = remoteFilename(url);
    const extension = imageExtensionFor(name, contentType);
    if (!extension) throw new Error("The URL did not return a supported image format");
    return {
      name: imageExtensionFor(name) ? name : `${imageBaseName(name)}.${extension}`,
      data: response.arrayBuffer,
      contentType,
    };
  }

  async readAsset(pathValue: unknown, sourcePath: string): Promise<ImageSectionAssetInput> {
    const resolved = this.resolve(pathValue, sourcePath);
    if (resolved.file) {
      return {
        name: resolved.file.name || imageBaseName(resolved.path),
        data: await this.host.app.vault.readBinary(resolved.file),
        contentType: imageContentTypeForPath(resolved.file.path),
      };
    }
    if (resolved.remote) return this.fetchRemoteAsset(resolved.path);
    throw new Error("Image file is no longer available");
  }

  async storeAssets(
    sourcePath: string,
    existingPaths: readonly string[],
    assets: readonly ImageSectionAssetInput[],
  ): Promise<StoredImageAssetsResult> {
    const current = [...new Set(existingPaths.map(normalizeImageSectionPath).filter(Boolean))];
    if (assets.length === 0) {
      return { paths: current, addedPaths: [], duplicatesSkipped: 0, acceptedAssetIndexes: [] };
    }
    const note = this.noteFile(sourcePath);
    const frontmatter = this.host.app.metadataCache.getFileCache(note)?.frontmatter ?? {};
    const folder = imageSectionFolderForNote({
      coverFolder: this.host.settings.coverFolder,
      mediaType: mediaTypeOf(frontmatter.media_type),
      title: frontmatter.title || note.basename,
      sourceProvider: frontmatter.source_provider,
      sourceId: frontmatter.source_id,
      notePath: note.path,
    });
    await this.host.ensureFolder(folder);

    const existingBinary = new Set<string>();
    const existingVisual = new Set<string>();
    for (const path of current) {
      const resolved = this.resolve(path, sourcePath);
      if (!resolved.file) continue;
      try {
        const fingerprints = await this.fileFingerprints(resolved.file);
        existingBinary.add(fingerprints.binary);
        if (fingerprints.visual) existingVisual.add(fingerprints.visual);
      } catch {
        // A broken/missing existing file must not block unrelated additions.
      }
    }

    const created: TFile[] = [];
    let duplicatesSkipped = 0;
    const acceptedBinary = new Set<string>();
    const acceptedVisual = new Set<string>();
    const acceptedAssetIndexes: number[] = [];
    try {
      for (const [assetIndex, asset] of assets.entries()) {
        const extension = imageExtensionFor(asset.name, asset.contentType);
        if (!extension) throw new Error(`${asset.name || "Image"} is not a supported image format`);
        const binary = await imageContentHash(asset.data);
        const visual = await this.assetVisualFingerprint(asset);
        if (existingBinary.has(binary) || acceptedBinary.has(binary)
          || (visual !== undefined && (existingVisual.has(visual) || acceptedVisual.has(visual)))) {
          duplicatesSkipped += 1;
          continue;
        }
        acceptedBinary.add(binary);
        if (visual !== undefined) acceptedVisual.add(visual);
        const path = await this.host.uniqueFilePath(folder, imageBaseName(asset.name), extension);
        const file = await this.host.app.vault.createBinary(path, asset.data);
        created.push(file);
        acceptedAssetIndexes.push(assetIndex);
        this.fingerprintCache.set(file.path, {
          size: asset.data.byteLength,
          mtime: file.stat.mtime,
          binary,
          visual,
        });
        this.host.getImageThumbnailSources(file);
      }
      const addedPaths = created.map((file) => file.path);
      return { paths: [...current, ...addedPaths], addedPaths, duplicatesSkipped, acceptedAssetIndexes };
    } catch (error) {
      await this.trashCreatedFiles(created);
      throw error;
    }
  }

  async rollbackStoredPaths(paths: readonly string[]): Promise<void> {
    const files = paths
      .map((path) => this.resolve(path, "").file)
      .filter((file): file is TFile => file instanceof TFile);
    await this.trashCreatedFiles(files);
  }

  async trashUnreferencedManagedPaths(
    sourcePath: string,
    markdownAfterUpdate: string,
    pathValues: readonly unknown[],
  ): Promise<void> {
    const note = this.noteFile(sourcePath);
    const frontmatter = this.host.app.metadataCache.getFileCache(note)?.frontmatter ?? {};
    const cover = normalizeImageSectionPath(normalizedCoverPath(frontmatter.cover));
    const referencedAfterUpdate = new Set(allManagedImageReferences(markdownAfterUpdate));
    const root = imageSectionRootFromCoverFolder(this.host.settings.coverFolder);
    let trashError: unknown = null;
    for (const pathValue of pathValues) {
      const path = normalizeImageSectionPath(pathValue);
      if (!path || /^https?:\/\//i.test(path) || referencedAfterUpdate.has(path) || cover === path) continue;
      const resolved = this.resolve(path, sourcePath);
      if (!resolved.file || !isManagedPath(resolved.file.path, root)) continue;
      try {
        await this.host.app.fileManager.trashFile(resolved.file);
        this.fingerprintCache.delete(resolved.file.path);
      } catch (error) {
        trashError ??= error;
      }
    }
    if (trashError) throw trashError;
  }

  async addAssets(
    sourcePath: string,
    locator: ImageSectionLocator,
    assets: readonly ImageSectionAssetInput[],
  ): Promise<ImageSectionAddResult> {
    const current = parseImageSectionSource(locator.source);
    const stored = await this.storeAssets(sourcePath, current, assets);
    if (stored.addedPaths.length > 0) {
      const note = this.noteFile(sourcePath);
      try {
        await this.host.app.vault.process(note, (markdown) => replaceImageSectionPaths(markdown, locator, stored.paths));
      } catch (error) {
        await this.rollbackStoredPaths(stored.addedPaths);
        throw error;
      }
    }
    return {
      source: serializeImageSectionPaths(stored.paths),
      added: stored.addedPaths.length,
      duplicatesSkipped: stored.duplicatesSkipped,
    };
  }

  async setColumns(
    sourcePath: string,
    locator: ImageSectionLocator,
    columns: number,
  ): Promise<ImageSectionStateUpdate> {
    const note = this.noteFile(sourcePath);
    const updated = await this.host.app.vault.process(
      note,
      (markdown) => setImageSectionColumns(markdown, locator, columns),
    );
    const block = findSectionState(updated, locator);
    return block;
  }

  async moveAsset(
    sourcePath: string,
    sourceLocator: ImageSectionLocator,
    targetLocator: ImageSectionLocator,
    pathValue: unknown,
    targetPathValue: unknown,
    placement: ImageSectionDropPlacement,
  ): Promise<ImageSectionMoveUpdate> {
    const note = this.noteFile(sourcePath);
    let result: ImageSectionMoveUpdate | null = null;
    await this.host.app.vault.process(note, (markdown) => {
      result = moveImageSectionPath(
        markdown,
        sourceLocator,
        targetLocator,
        pathValue,
        targetPathValue,
        placement,
      );
      return result.markdown;
    });
    if (!result) throw new Error("Could not update image section order");
    return result;
  }

  async remove(
    sourcePath: string,
    locator: ImageSectionLocator,
    pathValue: unknown,
  ): Promise<string> {
    return this.removeMany(sourcePath, locator, [pathValue]);
  }

  async removeMany(
    sourcePath: string,
    locator: ImageSectionLocator,
    pathValues: readonly unknown[],
  ): Promise<string> {
    const note = this.noteFile(sourcePath);
    const targets = new Set(pathValues.map(normalizeImageSectionPath).filter(Boolean));
    const current = parseImageSectionSource(locator.source);
    if (targets.size === 0) return serializeImageSectionPaths(current);

    const nextPaths = current.filter((entry) => !targets.has(entry));
    const updated = await this.host.app.vault.process(
      note,
      (markdown) => replaceImageSectionPaths(markdown, locator, nextPaths),
    );
    await this.trashUnreferencedManagedPaths(sourcePath, updated, [...targets]);
    return serializeImageSectionPaths(nextPaths);
  }

  async setAsCover(sourcePath: string, pathValue: unknown): Promise<void> {
    const note = this.noteFile(sourcePath);
    const path = normalizeImageSectionPath(pathValue);
    if (!path) throw new Error("Image path is empty");
    await this.host.app.fileManager.processFrontMatter(note, (frontmatter) => {
      frontmatter.cover = path;
    });
    this.host.refreshViews();
    new Notice("Media cover updated");
  }

  private async fileFingerprints(file: TFile): Promise<{ binary: string; visual?: string }> {
    const cached = this.fingerprintCache.get(file.path);
    if (cached && cached.size === file.stat.size && cached.mtime === file.stat.mtime) {
      return { binary: cached.binary, visual: cached.visual };
    }
    const data = await this.host.app.vault.readBinary(file);
    const binary = await imageContentHash(data);
    const visual = await this.safeVisualFingerprint(data, imageContentTypeForPath(file.path));
    this.fingerprintCache.set(file.path, { size: file.stat.size, mtime: file.stat.mtime, binary, visual });
    return { binary, visual };
  }

  private assetVisualFingerprint(asset: ImageSectionAssetInput): Promise<string | undefined> {
    const contentType = asset.contentType || imageContentTypeForPath(asset.name);
    return this.safeVisualFingerprint(asset.data, contentType);
  }

  private async safeVisualFingerprint(data: ArrayBuffer, contentType: string): Promise<string | undefined> {
    if (!/^(?:image\/(?:jpeg|png|webp|avif))$/i.test(contentType.split(";")[0].trim())) return undefined;
    try {
      return await visualImageFingerprint(data, contentType);
    } catch {
      return undefined;
    }
  }

  private async trashCreatedFiles(files: readonly TFile[]): Promise<void> {
    for (const file of files) {
      try { await this.host.app.fileManager.trashFile(file); } catch { /* best-effort rollback */ }
      this.fingerprintCache.delete(file.path);
    }
  }

  private noteFile(sourcePath: string): TFile {
    const file = this.host.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) throw new Error("The media note is no longer available");
    return file;
  }
}
const IMAGE_SERVICES = new WeakMap<object, ImageSectionService>();

export function imageSectionServiceForHost(host: ImageSectionHost): ImageSectionService {
  const key = host as object;
  const existing = IMAGE_SERVICES.get(key);
  if (existing) return existing;
  const service = new ImageSectionService(host);
  IMAGE_SERVICES.set(key, service);
  return service;
}
