import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile } from "obsidian";
import { createDefaultSettings } from "../../src/app/settings-model";
import { MediaAssetGarbageCollector } from "../../src/data/media-asset-garbage-collector";
import { MediaAssetReferenceService } from "../../src/data/media-asset-reference-service";

function file(path: string): TFile {
  const value = new TFile();
  value.path = path;
  value.name = path.split("/").pop() ?? path;
  value.basename = value.name.replace(/\.[^.]+$/, "");
  value.extension = value.name.split(".").pop() ?? "";
  value.stat = { ctime: 1, mtime: 1, size: 1 };
  return value;
}

describe("media asset garbage collector", () => {
  it("removes only unreferenced managed assets and stale journals", async () => {
    const note = file("Notes/Elsewhere.md");
    const shared = file("AnimeList/Images/anime/demo-bangumi-1/shared.png");
    const orphanImage = file("AnimeList/Images/anime/demo-bangumi-1/orphan.png");
    const orphanCover = file("AnimeList/Covers/anime/orphan.jpg");
    const leasedCover = file("AnimeList/Covers/anime/editing.jpg");
    const looseCover = file("AnimeList/Covers/user-owned.jpg");
    const files = new Map([note, shared, orphanImage, orphanCover, leasedCover, looseCover].map((entry) => [entry.path, entry]));
    const coverFolder = { path: "AnimeList/Covers", children: [orphanCover, leasedCover, looseCover] };
    const imageFolder = { path: "AnimeList/Images", children: [shared, orphanImage] };
    const journalLive = ".obsidian/plugins/animelist/state/image-order/live.json";
    const journalStale = ".obsidian/plugins/animelist/state/image-order/stale.json";
    const journalBroken = ".obsidian/plugins/animelist/state/image-order/broken.json";
    const trashedJournal: Array<{ from: string; to: string }> = [];
    const trashDirectories = new Set<string>();
    const trashed: string[] = [];
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer;
    const app: any = {
      metadataCache: {
        getFileCache() { return null; },
        getFirstLinkpathDest(target: string) { return files.get(target) ?? null; },
      },
      vault: {
        configDir: ".obsidian",
        getRoot() { return { children: [note] }; },
        getAbstractFileByPath(path: string) {
          if (path === "AnimeList/Covers") return coverFolder;
          if (path === "AnimeList/Images") return imageFolder;
          return files.get(path) ?? null;
        },
        async cachedRead() { return `![[${shared.path}]]`; },
        async read() { return `![[${shared.path}]]`; },
        adapter: {
          async exists(path: string) {
            return path === ".obsidian/plugins/animelist/state/image-order"
              || path === journalLive
              || path === journalStale
              || path === journalBroken
              || trashDirectories.has(path)
              || trashedJournal.some((entry) => entry.to === path);
          },
          async list() { return { files: [journalLive, journalStale, journalBroken], folders: [] }; },
          async readBinary(path: string) {
            if (path === journalLive) return encode({ sourcePath: note.path });
            if (path === journalStale) return encode({ sourcePath: "Deleted.md" });
            return new TextEncoder().encode("not-json").buffer;
          },
          async mkdir(path: string) { trashDirectories.add(path); },
          async rename(from: string, to: string) { trashedJournal.push({ from, to }); },
          async remove() { throw new Error("permanent remove must not be used"); },
        },
      },
      fileManager: {
        async trashFile(target: TFile) { trashed.push(target.path); files.delete(target.path); },
      },
    };
    const settings = createDefaultSettings();
    settings.coverFolder = "AnimeList/Covers";
    const collector = new MediaAssetGarbageCollector(app, "animelist", () => settings);
    const result = await collector.cleanup(new Set([leasedCover.path]));

    assert.deepEqual(trashed.sort(), [orphanCover.path, orphanImage.path].sort());
    assert.equal(trashed.includes(shared.path), false);
    assert.equal(trashed.includes(leasedCover.path), false);
    assert.equal(trashed.includes(looseCover.path), false);
    assert.deepEqual(trashedJournal.map((entry) => entry.from).sort(), [journalBroken, journalStale].sort());
    assert.equal(trashedJournal.every((entry) => entry.to.startsWith(".trash/AnimeList/Internal/image-order/")), true);
    assert.equal(result.result.removedManagedFiles, 2);
    assert.equal(result.result.removedJournalFiles, 2);
    assert.equal(result.references.referencedPaths.has(shared.path), true);
  });

  it("reads explicit full-vault references with bounded parallelism", async () => {
    const notes = Array.from({ length: 20 }, (_, index) => file(`Notes/${index}.md`));
    const shared = file("AnimeList/Images/anime/demo-bangumi-1/shared.png");
    const files = new Map<string, TFile>([[shared.path, shared], ...notes.map((note) => [note.path, note] as const)]);
    let reads = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const app: any = {
      metadataCache: {
        getFileCache() { return null; },
        getFirstLinkpathDest(target: string) { return files.get(target) ?? null; },
      },
      vault: {
        getRoot() { return { children: notes }; },
        getAbstractFileByPath(path: string) { return files.get(path) ?? null; },
        async cachedRead() {
          reads += 1;
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 1));
          inFlight -= 1;
          return `![[${shared.path}]]`;
        },
      },
    };
    const settings = createDefaultSettings();
    settings.coverFolder = "AnimeList/Covers";
    const references = await new MediaAssetReferenceService(app, () => settings).collect();

    assert.equal(reads, notes.length);
    assert.equal(maxInFlight > 1, true);
    assert.equal(maxInFlight <= 8, true);
    assert.equal(references.referencedPaths.has(shared.path), true);
  });
  it("reads disk Markdown instead of a stale display cache before deleting assets", async () => {
    const note = file("Notes/synced.md");
    const protectedImage = file("AnimeList/Images/anime/work-id/protected.png");
    const orphan = file("AnimeList/Images/anime/work-id/orphan.png");
    const files = new Map([note, protectedImage, orphan].map(item => [item.path, item]));
    let freshReads = 0;
    let cachedReads = 0;
    const deleted: string[] = [];
    const app: any = {
      metadataCache: {
        getFileCache() { return null; },
        getFirstLinkpathDest(target: string) { return files.get(target) ?? null; },
      },
      vault: {
        configDir: ".obsidian",
        getRoot() { return { children: [note] }; },
        getAbstractFileByPath(path: string) {
          if (path === "AnimeList/Images") {
            return { children: [protectedImage, orphan] };
          }
          return files.get(path) ?? null;
        },
        async cachedRead() { cachedReads += 1; return ""; },
        async read() { freshReads += 1; return `![[${protectedImage.path}]]`; },
        adapter: { async exists() { return false; } },
      },
      fileManager: {
        async trashFile(item: TFile) { deleted.push(item.path); files.delete(item.path); },
      },
    };
    const settings = createDefaultSettings();
    settings.coverFolder = "AnimeList/Covers";
    const collector = new MediaAssetGarbageCollector(app, "animelist", () => settings);
    const result = await collector.cleanup();
    assert.deepEqual(deleted, [orphan.path]);
    assert.equal(result.result.removedManagedFiles, 1);
    assert.equal(freshReads, 1);
    assert.equal(cachedReads, 0);
    assert.ok(files.has(protectedImage.path));
  });

  it("aborts remaining trash operations when a note gains a reference during cleanup", async () => {
    const note = file("Notes/changes-during-cleanup.md");
    const orphanA = file("AnimeList/Images/anime/work-id/a.png");
    const orphanB = file("AnimeList/Images/anime/work-id/b.png");
    const files = new Map([note, orphanA, orphanB].map(item => [item.path, item]));
    let markdown = "";
    const deleted: string[] = [];
    const app: any = {
      metadataCache: {
        getFileCache() { return null; },
        getFirstLinkpathDest(target: string) { return files.get(target) ?? null; },
      },
      vault: {
        configDir: ".obsidian",
        getRoot() { return { children: [note] }; },
        getAbstractFileByPath(path: string) {
          if (path === "AnimeList/Images") {
            return { children: [orphanA, orphanB] };
          }
          return files.get(path) ?? null;
        },
        async read() { return markdown; },
        adapter: { async exists() { return false; } },
      },
      fileManager: {
        async trashFile(item: TFile) {
          deleted.push(item.path);
          files.delete(item.path);
          if (item.path === orphanA.path) {
            markdown = `![[${orphanB.path}]]`;
            note.stat.mtime += 10;
            note.stat.size = markdown.length;
          }
        },
      },
    };
    const settings = createDefaultSettings();
    settings.coverFolder = "AnimeList/Covers";
    const collector = new MediaAssetGarbageCollector(app, "animelist", () => settings);
    await assert.rejects(collector.cleanup(), /Markdown changed during media cleanup/);
    assert.deepEqual(deleted, [orphanA.path]);
    assert.ok(files.has(orphanB.path), "an asset newly referenced by a note must survive");
  });

  it("stops before any deletion when a new Markdown note appears during the reference scan", async () => {
    const note = file("Notes/existing.md");
    const created = file("Notes/new.md");
    const orphan = file("AnimeList/Images/anime/work-id/orphan.png");
    const entries = [note];
    const files = new Map([note, orphan].map(item => [item.path, item]));
    const deleted: string[] = [];
    const app: any = {
      metadataCache: {
        getFileCache() { return null; },
        getFirstLinkpathDest(target: string) { return files.get(target) ?? null; },
      },
      vault: {
        configDir: ".obsidian",
        getRoot() { return { children: entries }; },
        getAbstractFileByPath(path: string) {
          if (path === "AnimeList/Images") return { children: [orphan] };
          return files.get(path) ?? null;
        },
        async read() { entries.push(created); files.set(created.path, created); return ""; },
        adapter: { async exists() { return false; } },
      },
      fileManager: {
        async trashFile(item: TFile) { deleted.push(item.path); },
      },
    };
    const settings = createDefaultSettings();
    settings.coverFolder = "AnimeList/Covers";
    await assert.rejects(new MediaAssetGarbageCollector(app, "animelist", () => settings).cleanup(),
      /Markdown changed during media cleanup/);
    assert.deepEqual(deleted, []);
  });

});