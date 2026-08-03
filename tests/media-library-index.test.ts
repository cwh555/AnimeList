import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile, TFolder, type App } from "obsidian";
import { MediaLibraryIndex } from "../src/data/media-library-index";
import type { MediaItem } from "../src/types";
import type { MediaRepository } from "../src/data/media-repository";

function file(path: string): TFile {
  const value = new TFile();
  value.path = path;
  value.name = path.split("/").at(-1) ?? path;
  value.basename = value.name.replace(/\.md$/, "");
  value.extension = "md";
  return value;
}

function item(source: TFile, title: string): MediaItem {
  return {
    title,
    originalTitle: "",
    mediaType: "anime",
    format: "anime",
    status: "ongoing",
    releaseStatus: "unknown",
    progress: 0,
    total: 0,
    unit: "episode",
    score: null,
    favorite: false,
    year: "",
    genres: [],
    people: [],
    platforms: [],
    sourceUrls: [],
    cover: "",
    filePath: source.path,
    updated: 0,
    updatedLabel: "",
    startedAt: "",
    completedAt: "",
    volumeLog: [],
  };
}

describe("media library index", () => {
  it("builds once, updates one note, and removes one note without rescanning", () => {
    const first = file("AnimeList/Anime/first.md");
    const second = file("AnimeList/Anime/second.md");
    const anime = new TFolder();
    anime.path = "AnimeList/Anime";
    anime.children = [first, second];
    const root = new TFolder();
    root.path = "AnimeList";
    root.children = [anime];
    const app = {
      vault: { getAbstractFileByPath: (path: string) => path === "AnimeList" ? root : null },
    } as unknown as App;
    const titles = new Map([[first.path, "First"], [second.path, "Second"]]);
    let reads = 0;
    const repository = {
      read(source: TFile) {
        reads += 1;
        const title = titles.get(source.path);
        return title ? item(source, title) : null;
      },
    } as unknown as MediaRepository;
    const index = new MediaLibraryIndex(app, repository);

    assert.deepEqual(index.snapshot(["AnimeList"]).map((entry) => entry.title), ["First", "Second"]);
    assert.equal(reads, 2);
    index.snapshot(["AnimeList"]);
    assert.equal(reads, 2);

    titles.set(first.path, "Updated");
    index.update(first, ["AnimeList"]);
    assert.equal(reads, 3);
    assert.deepEqual(index.snapshot(["AnimeList"]).map((entry) => entry.title), ["Updated", "Second"]);
    assert.equal(reads, 3);

    index.remove(second.path);
    assert.deepEqual(index.snapshot(["AnimeList"]).map((entry) => entry.title), ["Updated"]);
    assert.equal(reads, 3);
  });

  it("rebuilds only when roots change or the index is explicitly invalidated", () => {
    const first = file("AnimeList/Anime/first.md");
    const anime = new TFolder();
    anime.path = "AnimeList/Anime";
    anime.children = [first];
    const root = new TFolder();
    root.path = "AnimeList";
    root.children = [anime];
    const app = { vault: { getAbstractFileByPath: (path: string) => path === "AnimeList" ? root : null } } as unknown as App;
    let reads = 0;
    const repository = { read(source: TFile) { reads += 1; return item(source, "First"); } } as unknown as MediaRepository;
    const index = new MediaLibraryIndex(app, repository);

    index.snapshot(["AnimeList"]);
    assert.equal(reads, 1);
    index.snapshot(["AnimeList", "Archive"]);
    assert.equal(reads, 2);
    index.invalidate();
    index.snapshot(["AnimeList", "Archive"]);
    assert.equal(reads, 3);
  });
});
