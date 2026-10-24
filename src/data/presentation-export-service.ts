import { normalizePath } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import type { PresentationKind, PresentationMediaType } from "../domain/presentation-export";
import { copyPngBlobToClipboard } from "../ui/image-clipboard";

/** Presentation exports are new artifacts, never writes to media Markdown. */
export class PresentationExportService {
  constructor(private readonly host: AnimeListFeatureHost) {}
  exportFolderPath(): string {
    return normalizePath(`${this.host.settings.libraryRoot.trim() || "AnimeList"}/Exports`);
  }
  async saveText(content: string, kind: PresentationKind, type: PresentationMediaType): Promise<string> {
    const folder = this.exportFolderPath();
    await this.host.ensureFolder(folder);
    const path = await this.host.uniqueFilePath(folder, `AnimeList-${kind}-${type}`, "txt");
    await this.host.app.vault.create(path, content);
    return path;
  }
  async savePng(pages: readonly Blob[], kind: PresentationKind, type: PresentationMediaType): Promise<string[]> {
    if (!pages.length) throw new Error("There are no PNG pages to save");
    const folder = this.exportFolderPath();
    await this.host.ensureFolder(folder);
    const saved: string[] = [];
    for (let i = 0; i < pages.length; i += 1) {
      const path = await this.host.uniqueFilePath(folder,
        `AnimeList-${kind}-${type}-${String(i + 1).padStart(2, "0")}`, "png");
      await this.host.app.vault.createBinary(path, await pages[i].arrayBuffer());
      saved.push(path);
    }
    return saved;
  }
  async copyPng(pages: readonly Blob[]): Promise<void> {
    if (pages.length !== 1) throw new Error("Multiple PNG pages: save files instead");
    await copyPngBlobToClipboard(pages[0]);
  }
}
