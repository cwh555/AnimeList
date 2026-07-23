import { TFile } from "obsidian";
import "./search-pagination";
import AnimeListPlugin from "./main";
import { ProgressUnitIntegration } from "./progress-unit-integration";
import { normalizeProgressUnit } from "./progress-units";
import type { MediaType } from "./types";

export default class AnimeListPluginEntry extends AnimeListPlugin {
  private readonly progressUnitIntegration = new ProgressUnitIntegration(this);

  openAddModal(initialType = "anime"): void {
    super.openAddModal(initialType);
    this.progressUnitIntegration.enhanceAddModal();
  }

  openEditModal(path: string): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    const frontmatter = file instanceof TFile
      ? this.app.metadataCache.getFileCache(file)?.frontmatter
      : undefined;
    const mediaTypeValue = String(frontmatter?.media_type ?? "anime");
    const mediaType: MediaType = mediaTypeValue === "manga" || mediaTypeValue === "novel"
      ? mediaTypeValue
      : "anime";
    const currentUnit = normalizeProgressUnit(frontmatter?.progress_unit, mediaType);

    super.openEditModal(path);
    if (file instanceof TFile) {
      this.progressUnitIntegration.enhanceEditModal(file, mediaType, currentUnit);
    }
  }

  onunload(): void {
    this.progressUnitIntegration.dispose();
  }
}
