import { App, Notice, TFile, requestUrl, normalizePath } from "obsidian";
import { USER_AGENT } from "../app-metadata";
import type { AnimeListSettings } from "../domain/settings-types";
import type { ExternalMediaResult, MediaNoteForm } from "../domain/media-types";
import { slugify, stringValue } from "../domain/value-normalization";
import { normalizeMediaStatus } from "../media-status";
import { normalizeVolumeLog } from "../novel-progress";
import { uiText } from "../ui-text";
import { buildMediaMarkdown, validateMediaNoteForm } from "./media-note-codec";
import { MediaRepository } from "./media-repository";
import { LibraryStorage } from "./library-storage";


export interface CoverOptimizer {
  optimizeFile(file: TFile): Promise<unknown>;
}

export interface MediaNoteServiceCallbacks {
  openMediaFile(path: string): Promise<void>;
  refreshViews(): void;
}

export class MediaNoteService {
  constructor(
    private readonly app: App,
    private readonly settings: () => AnimeListSettings,
    private readonly repository: MediaRepository,
    private readonly storage: LibraryStorage,
    private readonly coverOptimizer: CoverOptimizer,
    private readonly callbacks: MediaNoteServiceCallbacks,
  ) {}

  async downloadCover(result: ExternalMediaResult): Promise<string> {
    if (!result.coverUrl) return "";
    const response = await requestUrl({
      url: result.coverUrl,
      method: "GET",
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,*/*",
        "User-Agent": USER_AGENT,
      },
    });
    const contentType = Object.entries(response.headers ?? {})
      .find(([key]) => key.toLocaleLowerCase() === "content-type")?.[1] ?? "";
    const extension = /webp/i.test(stringValue(contentType))
      ? "webp"
      : /png/i.test(stringValue(contentType))
        ? "png"
        : /avif/i.test(stringValue(contentType))
          ? "avif"
          : "jpg";
    const folder = normalizePath(`${this.settings().coverFolder}/${result.mediaType}`);
    await this.storage.ensureFolder(folder);
    const filename = `${slugify(result.title)}-${result.provider}-${result.sourceId || Date.now()}`;
    const path = await this.storage.uniqueFilePath(folder, filename, extension);
    const file = await this.app.vault.createBinary(path, response.arrayBuffer);
    try {
      await this.coverOptimizer.optimizeFile(file);
    } catch (error) {
      console.warn("AnimeList cover thumbnail generation failed", error);
    }
    return path;
  }

  async create(result: ExternalMediaResult, form: MediaNoteForm): Promise<TFile> {
    validateMediaNoteForm(result, form);
    const existing = this.repository.findBySource(
      this.storage.scanFolders(),
      result.provider,
      String(result.sourceId),
    );
    if (existing) {
      new Notice(uiText("notice.existingSource"));
      await this.callbacks.openMediaFile(existing.path);
      return existing;
    }

    let coverPath = "";
    if (result.coverUrl) {
      try {
        coverPath = await this.downloadCover(result);
      } catch (error) {
        console.warn("AnimeList cover download failed; using the remote URL.", error);
        new Notice(uiText("notice.coverRemote"));
      }
    }

    const folder = this.storage.mediaFolder(result.mediaType);
    if (folder) await this.storage.ensureFolder(folder);
    const path = await this.storage.uniqueFilePath(folder, form.title || result.title, "md");
    const templateContent = await this.storage.readTemplate(form.templatePath);
    const preparedForm: MediaNoteForm = {
      ...form,
      status: normalizeMediaStatus(form.status),
      volumeLog: result.mediaType === "novel" ? normalizeVolumeLog(form.volumeLog) : [],
    };
    const markdown = buildMediaMarkdown(result, preparedForm, coverPath, templateContent);
    const file = await this.app.vault.create(path, markdown);
    this.callbacks.refreshViews();
    return file;
  }
}
