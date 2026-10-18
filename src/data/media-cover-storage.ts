import { TFile, normalizePath, type App } from "obsidian";
import type { AnimeListSettings } from "../domain/settings-types";
import type { MediaType } from "../domain/media-types";
import type { MediaCoverAssetInput } from "../domain/manual-media";
import { slugify } from "../domain/value-normalization";
import type { LibraryStorage } from "./library-storage";

const MAX_COVER_BYTES = 20 * 1024 * 1024;
const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
const ALLOWED_EXTENSIONS = new Set(Object.values(MIME_EXTENSIONS));

export interface MediaCoverOptimizer {
  optimizeFile(file: TFile): Promise<unknown>;
}

export type MediaCoverStorageMode = "manual" | "replacement";

/** Validate before any side effects; never silently store an unsupported file as JPEG. */
export function mediaCoverExtension(asset: MediaCoverAssetInput): string {
  const byteLength = asset.data?.byteLength ?? 0;
  if (!(asset.data instanceof ArrayBuffer) || byteLength === 0 || byteLength > MAX_COVER_BYTES) {
    throw new Error("Cover image must be a nonempty file no larger than 20 MB.");
  }
  const nameExtension = asset.name.toLowerCase().split(".").pop() ?? "";
  const ext = nameExtension === "jpeg" ? "jpg" : nameExtension;
  const mime = (asset.contentType ?? "").split(";")[0].trim().toLowerCase();
  const mimeExtension = MIME_EXTENSIONS[mime];
  if (!ALLOWED_EXTENSIONS.has(ext) && !mimeExtension) {
    throw new Error("Use a JPEG, PNG, WebP, or AVIF cover image.");
  }
  if (mime && !mimeExtension) throw new Error("Unsupported cover image content type.");
  if (ALLOWED_EXTENSIONS.has(ext) && mimeExtension && ext !== mimeExtension) {
    throw new Error("The selected cover file extension does not match its image type.");
  }
  return ALLOWED_EXTENSIONS.has(ext) ? ext : mimeExtension;
}

/**
 * Shared local-cover writer for new manual works and later replacement.
 * Never overwrite an existing cover: other notes may reference that file.
 */
export class MediaCoverStorage {
  constructor(
    private readonly app: App,
    private readonly settings: () => AnimeListSettings,
    private readonly storage: LibraryStorage,
    private readonly optimizer: MediaCoverOptimizer,
  ) {}

  async store(
    mediaType: MediaType,
    title: string,
    asset: MediaCoverAssetInput,
    mode: MediaCoverStorageMode = "replacement",
  ): Promise<string> {
    const extension = mediaCoverExtension(asset);
    const folder = normalizePath(`${this.settings().coverFolder}/${mediaType}`);
    await this.storage.ensureFolder(folder);
    const path = await this.storage.uniqueFilePath(folder, `${slugify(title)}-${mode}`, extension);
    const file = await this.app.vault.createBinary(path, asset.data);
    try {
      await this.optimizer.optimizeFile(file);
    } catch (error) {
      // Thumbnail optimization is optional; the original is still a valid cover.
      console.warn("AnimeList cover thumbnail generation failed", error);
    }
    return path;
  }

  async discardUncommitted(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.fileManager.trashFile(file);
  }
}
