import { normalizePath, TFile, type App } from "obsidian";
import { getScopedMarkdownFiles } from "./vault-scope";
import { findImageSectionBlocks, normalizeImageSectionPath, replaceImageSectionPaths } from "../domain/image-section";
import type { CharacterCandidate, CharacterRecord, CharacterTier } from "../domain/characters/character";
import {
  characterFromFrontmatter, characterNoteSource, ensureCharacterCardBlock, findExistingCharacter, mergeCharacterAppearances, syncCharacterWorks,
} from "../domain/characters/character";

/** Local Markdown is authoritative. Character notes are outside the anime/manga/novel indices. */
export class CharacterLibraryService {
  private serial: Promise<void> = Promise.resolve();
  /** Obsidian metadata indexing may finish after a note is created. */
  private readonly staged = new Map<string, CharacterRecord>();
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

  private read(file: TFile): CharacterRecord | null {
    return characterFromFrontmatter(this.app.metadataCache.getFileCache(file)?.frontmatter, file.path);
  }

  async list(): Promise<CharacterRecord[]> {
    const files = getScopedMarkdownFiles(this.app, [this.folder()]);
    const records = files.map(file => this.read(file))
      .filter((item): item is CharacterRecord => item !== null);
    const indexed = new Set(records.map(item => item.id));
    const filePaths = new Set(files.map(file => file.path));
    for (const [id, pending] of this.staged) {
      if (indexed.has(id) || !filePaths.has(pending.path)) {
        this.staged.delete(id);
      } else {
        records.push(pending);
      }
    }
    return records.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant") || a.id.localeCompare(b.id));
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
          await this.app.vault.process(file, markdown => syncCharacterWorks(markdown, appearances));
        }
        const result = { ...existing, appearances };
        if (this.staged.has(existing.id)) this.staged.set(existing.id, result);
        return result;
      }
      await this.ensureFolder();
      const id = crypto.randomUUID();
      const path = normalizePath(this.folder() + "/character-" + id + ".md");
      await this.app.vault.create(path, characterNoteSource(id, { ...candidate, name }));
      // The Obsidian metadata cache can lag behind file creation.
      // Return the known written data; metadata-driven lists update when indexing catches up.
      const record: CharacterRecord = {
        id, path, name, tier: "liked",
        bangumiId: candidate.bangumiId ?? "", portrait: candidate.portrait ?? "",
        appearances: mergeCharacterAppearances([], candidate.appearance),
      };
      this.staged.set(id, record);
      return record;
    });
  }

  /** Attach a chosen character to its image/source work with bidirectional visible links. */
  async associateWork(path: string, workPath: string): Promise<void> {
    if (!workPath.trim()) return;
    await this.queue(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !file.path.startsWith(this.folder() + "/")) {
        throw new Error("Character not found");
      }
      const existing = this.read(file) ?? [...this.staged.values()].find(entry => entry.path === path);
      if (!existing) throw new Error("Character record unavailable");
      const appearances = mergeCharacterAppearances(existing.appearances, workPath);
      if (appearances.length === existing.appearances.length) return;
      await this.app.fileManager.processFrontMatter(file, fm => {
        fm.character_appearances = appearances;
      });
      await this.app.vault.process(file, source => syncCharacterWorks(source, appearances));
      if (this.staged.has(existing.id)) this.staged.set(existing.id, { ...existing, appearances });
    });
  }

  /** Upgrade older character notes on demand, without changing unrelated note sections. */
  async ensureVisibleWorks(path: string): Promise<void> {
    await this.queue(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !file.path.startsWith(this.folder() + "/")) return;
      const record = this.read(file) ?? [...this.staged.values()].find(item => item.path === path);
      if (!record) return;
      const upgrade = (markdown: string): string =>
        ensureCharacterCardBlock(syncCharacterWorks(markdown, record.appearances));
      const source = await this.app.vault.cachedRead(file);
      if (upgrade(source) === source) return;
      await this.app.vault.process(file, upgrade);
    });
  }

  /** Link an existing vault/remote image into a character's Image Section without copying its bytes. */
  async attachImage(path: string, imagePath: string): Promise<boolean> {
    return this.queue(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !file.path.startsWith(this.folder() + "/")) {
        throw new Error("Character not found");
      }
      const normalized = normalizeImageSectionPath(imagePath);
      if (!normalized) throw new Error("Image path is empty");
      if (!/^(?:https?|file):\/\//i.test(normalized)
        && !(this.app.vault.getAbstractFileByPath(normalized) instanceof TFile)
        && !this.app.metadataCache.getFirstLinkpathDest(normalized, path)) {
        throw new Error("Image path cannot be resolved inside the vault");
      }
      let changed = false;
      await this.app.vault.process(file, markdown => {
        const section = findImageSectionBlocks(markdown)[0];
        if (!section) throw new Error("Character has no Image Section");
        if (section.paths.includes(normalized)) return markdown;
        changed = true;
        return replaceImageSectionPaths(markdown, section, [...section.paths, normalized]);
      });
      return changed;
    });
  }

  /** Add a standard Image Section without modifying any existing session or frontmatter. */
  async createImageSession(path: string): Promise<void> {
    await this.queue(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !file.path.startsWith(this.folder() + "/")) {
        throw new Error("Character not found");
      }
      await this.app.vault.process(file, markdown => {
        const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
        const gap = markdown.endsWith(newline) ? newline : newline + newline;
        return markdown + gap + "```animelist-images" + newline + "```" + newline;
      });
    });
  }

  async renameAppearance(from: string, to: string): Promise<void> {
    if (!from || !to || from === to) return;
    await this.queue(async () => {
      const matching = (await this.list()).filter(item => item.appearances.includes(from));
      for (const record of matching) {
        const file = this.app.vault.getAbstractFileByPath(record.path);
        if (!(file instanceof TFile)) continue;
        const appearances = [...new Set(record.appearances.map(path => path === from ? to : path))];
        await this.app.fileManager.processFrontMatter(file, fm => {
          fm.character_appearances = appearances;
        });
        await this.app.vault.process(file, markdown => syncCharacterWorks(markdown, appearances));
        if (this.staged.has(record.id)) this.staged.set(record.id, { ...record, appearances });
      }
    });
  }

  renameCharacterPath(oldPath: string, newPath: string): void {
    for (const [id, record] of this.staged) {
      if (record.path === oldPath) this.staged.set(id, { ...record, path: newPath });
    }
  }

  async setName(path: string, name: string): Promise<void> {
    const next = name.trim();
    if (!next) throw new Error("Character name is required");
    await this.queue(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !file.path.startsWith(this.folder() + "/")) throw new Error("Character not found");
      await this.app.fileManager.processFrontMatter(file, fm => { fm.character_name = next; });
      for (const [id, record] of this.staged) {
        if (record.path === path) this.staged.set(id, { ...record, name: next });
      }
    });
  }

  /** Move only the character Markdown note to Trash; imported/shared artwork is not deleted. */
  async remove(path: string): Promise<void> {
    await this.queue(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !file.path.startsWith(this.folder() + "/")) {
        throw new Error("Character not found");
      }
      await this.app.fileManager.trashFile(file);
      for (const [id, staged] of this.staged) {
        if (staged.path === path) this.staged.delete(id);
      }
    });
  }

  async setTier(path: string, tier: CharacterTier): Promise<void> {
    await this.queue(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !file.path.startsWith(this.folder() + "/")) throw new Error("Character not found");
      await this.app.fileManager.processFrontMatter(file, frontmatter => {
        frontmatter.character_tier = tier;
      });
      for (const [id, record] of this.staged) {
        if (record.path === path) this.staged.set(id, { ...record, tier });
      }
    });
  }

  async setPortrait(path: string, portrait: string): Promise<void> {
    await this.queue(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !file.path.startsWith(this.folder() + "/")) throw new Error("Character not found");
      await this.app.fileManager.processFrontMatter(file, frontmatter => {
        frontmatter.character_portrait = portrait;
      });
      for (const [id, record] of this.staged) {
        if (record.path === path) this.staged.set(id, { ...record, portrait });
      }
    });
  }
}
