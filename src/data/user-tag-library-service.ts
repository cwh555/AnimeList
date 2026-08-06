import type { App, TFile } from "obsidian";
import { normalizeUserTag } from "../domain/user-tags";
import { mediaTypeOf, stringValue } from "../domain/value-normalization";
import { getScopedMarkdownFiles } from "../vault-scope";
import { compatibleGenres, writeCompatibleGenres } from "./media-frontmatter-compat";

export interface UserTagMutationResult {
  changedNotes: number;
}

export interface UserTagUsage {
  filePath: string;
  title: string;
}

function tagKey(value: string): string {
  return value.toLocaleLowerCase();
}

export class UserTagLibraryService {
  constructor(
    private readonly app: App,
    private readonly roots: () => string[],
  ) {}

  collect(): string[] {
    const tags: string[] = [];
    for (const file of this.mediaFiles()) {
      const frontmatter = this.frontmatter(file);
      if (!frontmatter) continue;
      tags.push(...compatibleGenres(frontmatter));
    }
    return tags;
  }

  usageCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const file of this.mediaFiles()) {
      const frontmatter = this.frontmatter(file);
      if (!frontmatter) continue;
      for (const tag of compatibleGenres(frontmatter)) {
        const key = tagKey(tag);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }

  usages(value: unknown): UserTagUsage[] {
    const tag = normalizeUserTag(value);
    if (!tag) return [];
    const key = tagKey(tag);
    return this.mediaFiles()
      .flatMap((file): UserTagUsage[] => {
        const frontmatter = this.frontmatter(file);
        if (!frontmatter) return [];
        const tags = compatibleGenres(frontmatter);
        if (!tags.some((entry) => tagKey(entry) === key)) return [];
        return [{
          filePath: file.path,
          title: stringValue(frontmatter.title, file.basename).trim() || file.basename,
        }];
      })
      .sort((left, right) => left.title.localeCompare(right.title, "zh-Hant"));
  }

  async rename(current: unknown, next: unknown): Promise<UserTagMutationResult> {
    const source = normalizeUserTag(current);
    const replacement = normalizeUserTag(next);
    if (!source || !replacement) return { changedNotes: 0 };
    const sourceKey = tagKey(source);
    let changedNotes = 0;

    for (const file of this.mediaFiles()) {
      const cached = this.frontmatter(file);
      if (!cached) continue;
      const tags = compatibleGenres(cached);
      if (!tags.some((tag) => tagKey(tag) === sourceKey)) continue;

      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const currentTags = compatibleGenres(frontmatter);
        if (!currentTags.some((tag) => tagKey(tag) === sourceKey)) return;
        writeCompatibleGenres(frontmatter, currentTags.map((tag) => tagKey(tag) === sourceKey ? replacement : tag));
      });
      changedNotes += 1;
    }

    return { changedNotes };
  }

  async remove(value: unknown): Promise<UserTagMutationResult> {
    const tag = normalizeUserTag(value);
    if (!tag) return { changedNotes: 0 };
    const key = tagKey(tag);
    let changedNotes = 0;

    for (const file of this.mediaFiles()) {
      const cached = this.frontmatter(file);
      if (!cached) continue;
      const tags = compatibleGenres(cached);
      if (!tags.some((entry) => tagKey(entry) === key)) continue;
      if (await this.removeFromFile(file, key)) changedNotes += 1;
    }

    return { changedNotes };
  }

  async removeFromWork(value: unknown, filePath: string): Promise<UserTagMutationResult> {
    const tag = normalizeUserTag(value);
    if (!tag || !filePath) return { changedNotes: 0 };
    const key = tagKey(tag);
    const file = this.mediaFiles().find((candidate) => candidate.path === filePath);
    if (!file) return { changedNotes: 0 };
    return { changedNotes: await this.removeFromFile(file, key) ? 1 : 0 };
  }

  private async removeFromFile(file: TFile, key: string): Promise<boolean> {
    const cached = this.frontmatter(file);
    if (!cached) return false;
    const tags = compatibleGenres(cached);
    if (!tags.some((entry) => tagKey(entry) === key)) return false;

    let changed = false;
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const currentTags = compatibleGenres(frontmatter);
      if (!currentTags.some((entry) => tagKey(entry) === key)) return;
      writeCompatibleGenres(frontmatter, currentTags.filter((entry) => tagKey(entry) !== key));
      changed = true;
    });
    return changed;
  }

  private mediaFiles(): TFile[] {
    return getScopedMarkdownFiles(this.app, this.roots()).filter((file) => this.frontmatter(file) !== null);
  }

  private frontmatter(file: TFile): Record<string, unknown> | null {
    const value = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return mediaTypeOf(value.media_type) ? value : null;
  }
}
