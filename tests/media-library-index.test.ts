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

function renameFile(source: TFile, path: string): void {
  source.path = path;
  source.name = path.split("/").at(-1) ?? path;
  source.basename = source.name.replace(/\.md$/, "");
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

  it("keeps a known media note in the library while Obsidian metadata catches up after a manual rename", () => {
    const source = file("AnimeList/Anime/original.md");
    const anime = new TFolder();
    anime.path = "AnimeList/Anime";
    anime.children = [source];
    const root = new TFolder();
    root.path = "AnimeList";
    root.children = [anime];
    const app = {
      vault: { getAbstractFileByPath: (path: string) => path === "AnimeList" ? root : null },
    } as unknown as App;
    let metadataReady = true;
    let reads = 0;
    const repository = {
      read(fileValue: TFile) {
        reads += 1;
        return metadataReady ? item(fileValue, "Stored title") : null;
      },
    } as unknown as MediaRepository;
    const index = new MediaLibraryIndex(app, repository);

    assert.deepEqual(index.snapshot(["AnimeList"]), [item(source, "Stored title")]);
    assert.equal(reads, 1);

    const oldPath = source.path;
    renameFile(source, "AnimeList/Anime/manual-name.md");
    metadataReady = false;
    index.rename(oldPath, source, ["AnimeList"]);

    const duringRename = index.snapshot(["AnimeList"]);
    assert.equal(reads, 1, "rename must not depend on metadataCache being ready at the new path");
    assert.equal(duringRename.length, 1);
    assert.equal(duringRename[0]?.title, "Stored title");
    assert.equal(duringRename[0]?.filePath, "AnimeList/Anime/manual-name.md");

    metadataReady = true;
    index.update(source, ["AnimeList"]);
    assert.equal(reads, 2);
    assert.equal(index.snapshot(["AnimeList"])[0]?.filePath, "AnimeList/Anime/manual-name.md");
  });

  it("removes an indexed note only when a rename moves it outside configured roots", () => {
    const source = file("AnimeList/Anime/inside.md");
    const anime = new TFolder();
    anime.path = "AnimeList/Anime";
    anime.children = [source];
    const root = new TFolder();
    root.path = "AnimeList";
    root.children = [anime];
    const app = {
      vault: { getAbstractFileByPath: (path: string) => path === "AnimeList" ? root : null },
    } as unknown as App;
    const repository = {
      read(fileValue: TFile) { return item(fileValue, "Inside"); },
    } as unknown as MediaRepository;
    const index = new MediaLibraryIndex(app, repository);

    index.snapshot(["AnimeList"]);
    const oldPath = source.path;
    renameFile(source, "Archive/inside.md");
    index.rename(oldPath, source, ["AnimeList"]);

    assert.deepEqual(index.snapshot(["AnimeList"]), []);
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
