import type { App, TFile } from "obsidian";
import type { MediaNoteForm, MediaType } from "../domain/media-types";
import { applyEditableMediaForm } from "./media-note-codec";

export interface MediaUpdateCallbacks {
  refreshViews(): void;
}

export class MediaUpdateService {
  constructor(
    private readonly app: App,
    private readonly callbacks: MediaUpdateCallbacks,
  ) {}

  async update(file: TFile, mediaType: MediaType, form: MediaNoteForm): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      applyEditableMediaForm(frontmatter, mediaType, form);
    });
    this.callbacks.refreshViews();
  }
}
