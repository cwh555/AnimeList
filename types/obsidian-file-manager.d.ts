import type { TAbstractFile } from "obsidian";

declare module "obsidian" {
  interface FileManager {
    /** Rename or move a file safely and update links according to Obsidian preferences. */
    renameFile(file: TAbstractFile, newPath: string): Promise<void>;
  }
}
