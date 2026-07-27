import { App, TFile, normalizePath } from "obsidian";
import {
  BUILTIN_TEMPLATES,
  BUILTIN_TEMPLATE_PREFIX,
  getBuiltInTemplateOptions,
} from "../builtin-templates";
import type { AnimeListSettings } from "../domain/settings-types";
import type { MediaType, TemplateOption } from "../domain/media-types";
import { sanitizePathPart } from "../domain/value-normalization";
import { uiText } from "../ui-text";
import { getScopedMarkdownFiles } from "../vault-scope";

export type SettingsProvider = () => AnimeListSettings;

function cleanVaultPath(value: string): string {
  return normalizePath(value).replace(/^\/+|\/+$/g, "");
}

export class LibraryStorage {
  constructor(
    private readonly app: App,
    private readonly settingsProvider: SettingsProvider,
  ) {}

  private get settings(): AnimeListSettings {
    return this.settingsProvider();
  }

  managedMediaFolder(mediaType: MediaType): string {
    const folderName = mediaType === "anime" ? "Anime" : mediaType === "manga" ? "Manga" : "Novel";
    return cleanVaultPath(`${this.settings.libraryRoot}/${folderName}`);
  }

  mediaFolder(mediaType: MediaType): string {
    return this.settings.storageMode === "flat"
      ? cleanVaultPath(this.settings.flatMediaFolder)
      : this.managedMediaFolder(mediaType);
  }

  scanFolders(): string[] {
    const primary = this.settings.storageMode === "flat"
      ? cleanVaultPath(this.settings.flatMediaFolder)
      : cleanVaultPath(this.settings.libraryRoot);
    return [...new Set([
      primary,
      ...this.settings.additionalScanFolders.map(cleanVaultPath),
    ].filter((folder) => folder || this.settings.storageMode === "flat"))];
  }

  async ensureFolder(value: string): Promise<void> {
    const normalized = cleanVaultPath(value);
    if (!normalized) return;
    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (this.app.vault.getAbstractFileByPath(current)) continue;
      try {
        await this.app.vault.createFolder(current);
      } catch (error) {
        if (!this.app.vault.getAbstractFileByPath(current)) throw error;
      }
    }
  }

  async initialize(copyTemplates = false): Promise<void> {
    if (this.settings.storageMode === "managed") {
      await this.ensureFolder(this.settings.libraryRoot);
      for (const mediaType of ["anime", "manga", "novel"] as const) {
        await this.ensureFolder(this.managedMediaFolder(mediaType));
      }
    } else if (this.settings.flatMediaFolder) {
      await this.ensureFolder(this.settings.flatMediaFolder);
    }
    await this.ensureFolder(this.settings.coverFolder);
    await this.ensureFolder(this.settings.templateFolder);
    if (copyTemplates) await this.copyBuiltInTemplates();
  }

  private async copyBuiltInTemplates(): Promise<void> {
    const files: ReadonlyArray<readonly [string, string]> = [
      ["Common/簡潔筆記.md", BUILTIN_TEMPLATES["builtin:plain"]],
    ];
    for (const [relativePath, content] of files) {
      const filePath = normalizePath(`${this.settings.templateFolder}/${relativePath}`);
      const parent = filePath.split("/").slice(0, -1).join("/");
      if (parent) await this.ensureFolder(parent);
      if (!this.app.vault.getAbstractFileByPath(filePath)) {
        await this.app.vault.create(filePath, content);
      }
    }
  }

  templates(mediaType: MediaType): TemplateOption[] {
    const typeFolder = mediaType === "anime" ? "Anime" : mediaType === "manga" ? "Manga" : "Novel";
    const root = cleanVaultPath(this.settings.templateFolder);
    const custom = getScopedMarkdownFiles(this.app, [root])
      .filter((file) => {
        if (!root || !file.path.startsWith(`${root}/`)) return false;
        const relative = file.path.slice(root.length + 1);
        return !relative.includes("/")
          || relative.startsWith("Common/")
          || relative.startsWith(`${typeFolder}/`);
      })
      .sort((left, right) => left.path.localeCompare(right.path, "zh-Hant"))
      .map((file) => ({
        path: file.path,
        name: file.path.startsWith(`${root}/Common/`)
          ? uiText("common.sharedName", { name: file.basename })
          : file.basename,
      }));
    return [...getBuiltInTemplateOptions(mediaType), ...custom];
  }

  async readTemplate(templatePath: string): Promise<string> {
    if (!templatePath) return "";
    if (templatePath.startsWith(BUILTIN_TEMPLATE_PREFIX)) {
      return BUILTIN_TEMPLATES[templatePath] ?? "";
    }
    const file = this.app.vault.getAbstractFileByPath(templatePath);
    return file instanceof TFile ? this.app.vault.cachedRead(file) : "";
  }

  async uniqueFilePath(folder: string, baseName: string, extension: string): Promise<string> {
    const cleanName = sanitizePathPart(baseName);
    const candidatePath = (suffix = "") => normalizePath(
      folder
        ? `${folder}/${cleanName}${suffix}.${extension}`
        : `${cleanName}${suffix}.${extension}`,
    );
    let candidate = candidatePath();
    let index = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = candidatePath(` (${index})`);
      index += 1;
    }
    return candidate;
  }
}
