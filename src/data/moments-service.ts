import { TFile } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import type { ImageSectionAssetInput, ImageSectionService } from "./image-section-service";
import {
  allMomentIds,
  createMomentId,
  hasUniqueMomentIds,
  hasUniqueMomentIdsInMarkdown,
  parseMomentsSource,
  replaceMoments,
  serializeMomentsSource,
  type MomentItem,
  type MomentsLocator,
} from "../domain/moments";
import { normalizeImageSectionPath } from "../domain/image-section";

export interface MomentEditorInput {
  text: string;
  retainedImages: readonly string[];
  newAssets: readonly ImageSectionAssetInput[];
}

export interface MomentMutationResult {
  source: string;
  moment?: MomentItem;
  duplicatesSkipped: number;
}

function normalizedText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export class MomentsService {
  constructor(
    private readonly host: Pick<AnimeListFeatureHost, "app">,
    readonly images: ImageSectionService,
  ) {}

  async addMoment(
    sourcePath: string,
    locator: MomentsLocator,
    input: MomentEditorInput,
  ): Promise<MomentMutationResult> {
    const text = normalizedText(input.text);
    if (!text) throw new Error("Moment text is required");
    const current = parseMomentsSource(locator.source);
    this.assertUsableIds(current);
    const stored = await this.images.storeAssets(sourcePath, [], input.newAssets);
    if (!stored.paths.length) {
      await this.images.rollbackStoredPaths(stored.addedPaths);
      throw new Error("Add at least one image to this moment");
    }

    const note = this.noteFile(sourcePath);
    try {
      const markdown = await this.host.app.vault.read(note);
      if (!hasUniqueMomentIdsInMarkdown(markdown)) {
        throw new Error("This note has missing or duplicate Moment IDs; fix the YAML before adding another moment");
      }
      const id = createMomentId(allMomentIds(markdown));
      const moment: MomentItem = { id, text, images: stored.paths };
      const next = [...current, moment];
      await this.host.app.vault.process(note, (value) => replaceMoments(value, locator, next));
      return { source: serializeMomentsSource(next), moment, duplicatesSkipped: stored.duplicatesSkipped };
    } catch (error) {
      await this.images.rollbackStoredPaths(stored.addedPaths);
      throw error;
    }
  }

  async editMoment(
    sourcePath: string,
    locator: MomentsLocator,
    momentId: string,
    input: MomentEditorInput,
  ): Promise<MomentMutationResult> {
    const text = normalizedText(input.text);
    if (!text) throw new Error("Moment text is required");
    const current = parseMomentsSource(locator.source);
    this.assertUsableIds(current);
    const indexes = current.flatMap((moment, index) => moment.id === momentId ? [index] : []);
    if (indexes.length !== 1) throw new Error("Could not safely locate this moment");
    const index = indexes[0];
    const previous = current[index];
    const previousSet = new Set(previous.images);
    const retained = [...new Set(input.retainedImages
      .map(normalizeImageSectionPath)
      .filter((path) => path && previousSet.has(path)))];
    const stored = await this.images.storeAssets(sourcePath, retained, input.newAssets);
    if (!stored.paths.length) {
      await this.images.rollbackStoredPaths(stored.addedPaths);
      throw new Error("A moment must keep at least one image");
    }

    const nextMoment: MomentItem = { id: previous.id, text, images: stored.paths };
    const next = current.map((moment, position) => position === index ? nextMoment : moment);
    const note = this.noteFile(sourcePath);
    try {
      const updated = await this.host.app.vault.process(note, (value) => replaceMoments(value, locator, next));
      const removed = previous.images.filter((path) => !stored.paths.includes(path));
      await this.images.trashUnreferencedManagedPaths(sourcePath, updated, removed);
      return { source: serializeMomentsSource(next), moment: nextMoment, duplicatesSkipped: stored.duplicatesSkipped };
    } catch (error) {
      await this.images.rollbackStoredPaths(stored.addedPaths);
      throw error;
    }
  }

  async deleteMoment(
    sourcePath: string,
    locator: MomentsLocator,
    momentId: string,
  ): Promise<string> {
    const current = parseMomentsSource(locator.source);
    this.assertUsableIds(current);
    const matches = current.filter((moment) => moment.id === momentId);
    if (matches.length !== 1) throw new Error("Could not safely locate this moment");
    const target = matches[0];
    const next = current.filter((moment) => moment.id !== momentId);
    const note = this.noteFile(sourcePath);
    const updated = await this.host.app.vault.process(note, (value) => replaceMoments(value, locator, next));
    await this.images.trashUnreferencedManagedPaths(sourcePath, updated, target.images);
    return serializeMomentsSource(next);
  }

  private assertUsableIds(moments: readonly MomentItem[]): void {
    if (!hasUniqueMomentIds(moments)) {
      throw new Error("This moments section has missing or duplicate IDs; fix the YAML before editing it");
    }
  }

  private noteFile(sourcePath: string): TFile {
    const file = this.host.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) throw new Error("The media note is no longer available");
    return file;
  }
}
