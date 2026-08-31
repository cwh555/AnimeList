import type { App, TFile } from "obsidian";
import type { MediaNoteForm, MediaType } from "../domain/media-types";
import { mediaNoteFolder, mediaTitleChanged } from "../domain/media-note-filename";
import { applyEditableMediaForm } from "./media-note-codec";
import { uniqueVaultFilePath } from "./vault-file-path";

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
  ) {}

  async update(file: TFile, mediaType: MediaType, form: MediaNoteForm): Promise<void> {
    const nextTitle = validatedTitle(mediaType, form);
    const previousTitle = this.app.metadataCache?.getFileCache(file)?.frontmatter?.title;
    const originalPath = file.path;
    let renamed = false;

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

    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        applyEditableMediaForm(frontmatter, mediaType, form);
      });
    } catch (error) {
      if (renamed) {
        try {
          await this.app.fileManager.renameFile(file, originalPath);
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            `AnimeList could not save the edited note or restore its original filename: ${originalPath}`,
          );
        }
      }
      throw error;
    }

    this.callbacks.refreshViews();
  }
}
