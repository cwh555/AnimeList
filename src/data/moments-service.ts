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
import {
  momentImageLayoutState,
  normalizeMomentStackFocusY,
  type MomentImageLayout,
} from "../domain/moment-image-layout";

export interface MomentEditorInput {
  text: string;
  source?: string;
  position?: string;
  speaker?: string;
  tags?: readonly string[];
  note?: string;
  imageLayout?: MomentImageLayout;
  stackReveal?: number;
  stackFocusY?: readonly number[];
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

function normalizedOptional(value: string | undefined): string | undefined {
  const normalized = (value ?? "").replace(/\r\n?/g, "\n").trim();
  return normalized || undefined;
}

function normalizedTags(values: readonly string[] | undefined): string[] | undefined {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(normalized);
  }
  return tags.length ? tags : undefined;
}

function buildMomentPayload(
  id: string,
  input: MomentEditorInput,
  images: string[],
  stackFocusY: readonly number[],
): MomentItem {
  const source = normalizedOptional(input.source);
  const position = normalizedOptional(input.position);
  const speaker = normalizedOptional(input.speaker);
  const tags = normalizedTags(input.tags);
  const note = normalizedOptional(input.note);
  const layout = momentImageLayoutState({
    imageLayout: input.imageLayout,
    stackReveal: input.stackReveal,
    stackFocusY,
  }, images.length);
  return {
    id,
    text: normalizedText(input.text),
    ...(source ? { source } : {}),
    ...(position ? { position } : {}),
    ...(speaker ? { speaker } : {}),
    ...(tags ? { tags } : {}),
    ...(note ? { note } : {}),
    images,
    ...layout,
  };
}

function stackFocusForStoredImages(
  input: MomentEditorInput,
  retainedSourceIndexes: readonly number[],
  acceptedAssetIndexes: readonly number[],
  assetFocusOffset: number,
  imageCount: number,
): number[] {
  const requested = [...(input.stackFocusY ?? [])];
  const selected = [
    ...retainedSourceIndexes.map((index) => requested[index]),
    ...acceptedAssetIndexes.map((index) => requested[assetFocusOffset + index]),
  ];
  return normalizeMomentStackFocusY(selected, imageCount);
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
      const focusY = stackFocusForStoredImages(
        input,
        [],
        stored.acceptedAssetIndexes,
        0,
        stored.paths.length,
      );
      const moment = buildMomentPayload(id, input, stored.paths, focusY);
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
    const retained: string[] = [];
    const retainedSourceIndexes: number[] = [];
    const seenRetained = new Set<string>();
    input.retainedImages.forEach((value, sourceIndex) => {
      const path = normalizeImageSectionPath(value);
      if (!path || !previousSet.has(path) || seenRetained.has(path)) return;
      seenRetained.add(path);
      retained.push(path);
      retainedSourceIndexes.push(sourceIndex);
    });
    const stored = await this.images.storeAssets(sourcePath, retained, input.newAssets);
    if (!stored.paths.length) {
      await this.images.rollbackStoredPaths(stored.addedPaths);
      throw new Error("A moment must keep at least one image");
    }

    const focusY = stackFocusForStoredImages(
      input,
      retainedSourceIndexes,
      stored.acceptedAssetIndexes,
      input.retainedImages.length,
      stored.paths.length,
    );
    const nextMoment = buildMomentPayload(previous.id, input, stored.paths, focusY);
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
