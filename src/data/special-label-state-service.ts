import { TFile, type App } from "obsidian";
import {
  normalizeMasterpieceLabels,
  type SpecialLabelState,
} from "../domain/masterpiece-labels";
import { uiText } from "../ui-text";

export interface SpecialLabelStateCallbacks {
  refreshViews(): void;
}

export class SpecialLabelStateService {
  constructor(
    private readonly app: App,
    private readonly callbacks: SpecialLabelStateCallbacks,
  ) {}

  private mediaFile(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(uiText("validation.mediaNoteMissing"));
    return file;
  }

  private async updateFrontmatter(
    path: string,
    update: (frontmatter: Record<string, unknown>) => void,
  ): Promise<void> {
    const file = this.mediaFile(path);
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      update(frontmatter);
      delete frontmatter.updated_at;
      delete frontmatter.metadata_updated_at;
    });
    this.callbacks.refreshViews();
  }

  async setFavorite(path: string, next: boolean): Promise<void> {
    await this.updateFrontmatter(path, (frontmatter) => {
      frontmatter.favorite = next;
    });
  }

  async update(path: string, state: SpecialLabelState): Promise<void> {
    const labels = normalizeMasterpieceLabels(state.masterpieceLabels);
    await this.updateFrontmatter(path, (frontmatter) => {
      frontmatter.favorite = state.favorite === true;
      if (labels.length) frontmatter.masterpiece_labels = labels;
      else delete frontmatter.masterpiece_labels;
    });
  }
}
