import { normalizePath, parseYaml, TFile, type App } from "obsidian";
import type { CharacterCandidate, CharacterRecord, CharacterTier } from "../domain/characters/character";
import {
  characterFromFrontmatter, characterNoteSource, findExistingCharacter, mergeCharacterAppearances,
} from "../domain/characters/character";

/** Local Markdown is authoritative. Character notes are outside the anime/manga/novel indices. */
export class CharacterLibraryService {
  private serial: Promise<void> = Promise.resolve();
  constructor(private readonly app: App, private readonly root: () => string) {}

  private folder(): string {
    return normalizePath(this.root().replace(/\/+$/, "") + "/Characters");
  }

  private async ensureFolder(): Promise<void> {
    const folder = this.folder();
    const parts = folder.split("/");
    for (let index = 1; index <= parts.length; index += 1) {
      const path = parts.slice(0, index).join("/");
      if (!(await this.app.vault.adapter.exists(path))) await this.app.vault.createFolder(path);
    }
  }

  private async read(file: TFile): Promise<CharacterRecord | null> {
    const source = await this.app.vault.read(file);
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
    if (!match) return null;
    try { return characterFromFrontmatter(parseYaml(match[1]), file.path); }
    catch { return null; }
  }

  async list(): Promise<CharacterRecord[]> {
    const prefix = this.folder() + "/";
    const files = this.app.vault.getMarkdownFiles().filter(file => file.path.startsWith(prefix));
    const records = await Promise.all(files.map(file => this.read(file)));
    return records.filter((item): item is CharacterRecord => item !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant") || a.id.localeCompare(b.id));
  }

  private queue<T>(run: () => Promise<T>): Promise<T> {
    const task = this.serial.then(run);
    this.serial = task.then(() => {}, () => {});
    return task;
  }

  async collect(candidate: CharacterCandidate): Promise<CharacterRecord> {
    return this.queue(async () => {
      const name = candidate.name.trim();
      if (!name) throw new Error("Character name is required");
      const existing = findExistingCharacter(await this.list(), candidate);
      if (existing) {
        const appearances = mergeCharacterAppearances(existing.appearances, candidate.appearance);
        if (appearances.length !== existing.appearances.length) {
          const file = this.app.vault.getAbstractFileByPath(existing.path);
          if (!(file instanceof TFile)) throw new Error("Character file no longer exists");
          await this.app.fileManager.processFrontMatter(file, frontmatter => {
            frontmatter.character_appearances = appearances;
          });
        }
        return { ...existing, appearances };
      }
      await this.ensureFolder();
      const id = crypto.randomUUID();
      const path = normalizePath(this.folder() + "/character-" + id + ".md");
      const file = await this.app.vault.create(path, characterNoteSource(id, { ...candidate, name }));
      const record = await this.read(file);
      if (!record) throw new Error("Unable to read the newly created character");
      return record;
    });
  }

  async setTier(path: string, tier: CharacterTier): Promise<void> {
    await this.queue(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !(await this.read(file))) throw new Error("Character not found");
      await this.app.fileManager.processFrontMatter(file, frontmatter => {
        frontmatter.character_tier = tier;
      });
    });
  }

  async setPortrait(path: string, portrait: string): Promise<void> {
    await this.queue(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !(await this.read(file))) throw new Error("Character not found");
      await this.app.fileManager.processFrontMatter(file, frontmatter => {
        frontmatter.character_portrait = portrait;
      });
    });
  }
}
