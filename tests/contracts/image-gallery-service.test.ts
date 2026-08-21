import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile } from "obsidian";
import { ImageGalleryService } from "../../src/data/image-gallery-service";
import type { MediaItem } from "../../src/domain/media-types";

function file(path: string, mtime = 1, size = 1): TFile {
  const value = new TFile();
  value.path = path;
  value.name = path.split("/").pop() ?? path;
  value.basename = value.name.replace(/\.[^.]+$/, "");
  value.extension = "md";
  value.stat = { ctime: 1, mtime, size };
  return value;
}

function item(path: string, title: string): MediaItem {
  return {
    title,
    originalTitle: "",
    mediaType: "anime",
    format: "tv",
    status: "completed",
    releaseStatus: "finished",
    progress: 1,
    total: 12,
    unit: "episode",
    score: null,
    favorite: false,
    year: 2026,
    genres: [], people: [], platforms: [], sourceUrls: [], cover: "",
    filePath: path, updated: 0, updatedLabel: "", startedAt: "", completedAt: "", volumeLog: [],
  };
}

describe("image gallery service", () => {
  it("reads only supplied media notes and reuses unchanged note cache entries", async () => {
    const first = file("Anime/Frieren.md", 1, 40);
    const second = file("Anime/Kaguya.md", 1, 40);
    const unrelated = file("Notes/random.md", 1, 40);
    const files = new Map([[first.path, first], [second.path, second], [unrelated.path, unrelated]]);
    const markdown = new Map([
      [first.path, "```animelist-images\n- Images/frieren.jpg\n```"],
      [second.path, "# no images"],
      [unrelated.path, "```animelist-images\n- Images/unrelated.jpg\n```"],
    ]);
    const reads: string[] = [];
    const app: any = {
      vault: {
        getAbstractFileByPath(path: string) { return files.get(path) ?? null; },
        async cachedRead(target: TFile) {
          reads.push(target.path);
          return markdown.get(target.path) ?? "";
        },
      },
    };
    const service = new ImageGalleryService({ app });
    const items = [item(first.path, "Frieren"), item(second.path, "Kaguya")];

    const initial = await service.collect(items);
    const cached = await service.collect(items);

    assert.deepEqual(initial.map((work) => work.title), ["Frieren"]);
    assert.deepEqual(cached.map((work) => work.title), ["Frieren"]);
    assert.deepEqual(reads.sort(), [first.path, second.path].sort());
    assert.equal(reads.includes(unrelated.path), false);
  });

  it("re-reads only a changed media note and evicts notes no longer in the library", async () => {
    const first = file("Anime/Frieren.md", 1, 40);
    const second = file("Anime/Kaguya.md", 1, 40);
    const files = new Map([[first.path, first], [second.path, second]]);
    const markdown = new Map([
      [first.path, "```animelist-images\n- Images/frieren.jpg\n```"],
      [second.path, "# none"],
    ]);
    const reads: string[] = [];
    const app: any = { vault: {
      getAbstractFileByPath(path: string) { return files.get(path) ?? null; },
      async cachedRead(target: TFile) { reads.push(target.path); return markdown.get(target.path) ?? ""; },
    } };
    const service = new ImageGalleryService({ app });
    const firstItem = item(first.path, "Frieren");
    const secondItem = item(second.path, "Kaguya");
    await service.collect([firstItem, secondItem]);

    second.stat = { ...second.stat, mtime: 2, size: 60 };
    markdown.set(second.path, "```animelist-images\n- Images/kaguya.jpg\n```");
    const updated = await service.collect([firstItem, secondItem]);
    assert.deepEqual(updated.map((work) => work.title), ["Frieren", "Kaguya"]);
    assert.deepEqual(reads, [first.path, second.path, second.path]);

    await service.collect([secondItem]);
    service.invalidate(second.path);
    await service.collect([secondItem]);
    assert.deepEqual(reads, [first.path, second.path, second.path, second.path]);
  });
});
