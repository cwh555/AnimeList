import type { App, TFile } from "obsidian";
import type { MediaNoteForm, MediaType } from "../domain/media-types";
import { mediaNoteFolder, mediaTitleChanged } from "../domain/media-note-filename";
import { applyEditableMediaForm } from "./media-note-codec";
import { uniqueVaultFilePath } from "./vault-file-path";
import type { MediaCoverAssetInput } from "../domain/manual-media";
import { mediaCoverExtension, type MediaCoverStorage } from "./media-cover-storage";

export interface MediaUpdateCallbacks {
  refreshViews(): void;
}

function validatedTitle(mediaType: MediaType, form: MediaNoteForm): string {
  const probe: Record<string, unknown> = {};
  applyEditableMediaForm(probe, mediaType, form);
  if (typeof probe.title !== "string") throw new Error("Validated media title is missing");
  return probe.title;
}

export class MediaUpdateService {
  constructor(
    private readonly app: App,
    private readonly callbacks: MediaUpdateCallbacks,
    private readonly coverStorage?: Pick<MediaCoverStorage, "store" | "discardUncommitted">,
  ) {}

  async update(
    file: TFile,
    mediaType: MediaType,
    form: MediaNoteForm,
    coverAsset?: MediaCoverAssetInput | null,
  ): Promise<void> {
    const nextTitle = validatedTitle(mediaType, form);
    if (coverAsset) {
      mediaCoverExtension(coverAsset);
      if (!this.coverStorage) throw new Error("Local cover storage is unavailable.");
    }
    const previousTitle = this.app.metadataCache?.getFileCache(file)?.frontmatter?.title;
    const originalPath = file.path;
    let renamed = false;
    let newCoverPath = "";

    try {
      if (coverAsset && this.coverStorage) {
        newCoverPath = await this.coverStorage.store(mediaType, nextTitle, coverAsset, "replacement");
      }
      if (mediaTitleChanged(previousTitle, nextTitle)) {
        const targetPath = uniqueVaultFilePath(
          this.app.vault,
          mediaNoteFolder(originalPath),
          nextTitle,
          "md",
          { ignorePath: originalPath },
        );
        if (targetPath !== originalPath) {
          await this.app.fileManager.renameFile(file, targetPath);
          renamed = true;
        }
      }

      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        applyEditableMediaForm(frontmatter, mediaType, form);
        if (newCoverPath) frontmatter.cover = newCoverPath;
      });
    } catch (error) {
      const failures: unknown[] = [];
      if (renamed) {
        try {
          await this.app.fileManager.renameFile(file, originalPath);
        } catch (rollbackError) {
          failures.push(rollbackError);
        }
      }
      if (newCoverPath && this.coverStorage) {
        try {
          await this.coverStorage.discardUncommitted(newCoverPath);
        } catch (rollbackError) {
          failures.push(rollbackError);
        }
      }
      if (failures.length) {
        throw new AggregateError(
          [error, ...failures],
          `AnimeList could not save the note or fully roll back its cover/filename: ${originalPath}`,
        );
      }
      throw error;
    }

    this.callbacks.refreshViews();
  }
}
