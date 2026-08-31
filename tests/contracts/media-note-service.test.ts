import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App, TFile } from "obsidian";
import type { ExternalMediaResult, MediaNoteForm } from "../../src/domain/media-types";
import { createDefaultSettings } from "../../src/app/settings-model";
import { MediaNoteService } from "../../src/data/media-note-service";
import type { MediaRepository } from "../../src/data/media-repository";
import type { LibraryStorage } from "../../src/data/library-storage";

function externalResult(): ExternalMediaResult {
  return {
    provider: "AniList",
    sourceId: "42",
    title: "Example",
    originalTitle: "原題",
    romajiTitle: "Example",
    mediaType: "anime",
    format: "tv",
    total: 12,
    unit: "episode",
    year: 2024,
    genres: ["戀愛"],
    rawGenres: [],
    people: ["Studio A"],
    platforms: [],
    sourceUrl: "https://example.invalid/42",
    coverUrl: "",
    summary: "",
    externalScore: null,
    releaseStatus: "finished",
  };
}

function noteForm(title = "Example"): MediaNoteForm {
  return {
    title,
    status: "ongoing",
    releaseStatus: "finished",
    progress: 3,
    total: 12,
    unit: "episode",
    score: null,
    favorite: false,
    startedAt: "2024-01-02",
    completedAt: "",
    genres: ["戀愛"],
    templatePath: "builtin:plain",
    volumeLog: [],
  };
}

describe("media note service", () => {
  it("validates before any storage or cover side effect", async () => {
    let sideEffects = 0;
    const app = { vault: { create: async () => { sideEffects += 1; } } } as unknown as App;
    const repository = {
      findBySource() { sideEffects += 1; return undefined; },
    } as unknown as MediaRepository;
    const storage = {
      scanFolders() { sideEffects += 1; return []; },
    } as unknown as LibraryStorage;
    const service = new MediaNoteService(
      app,
      createDefaultSettings,
      repository,
      storage,
      { async optimizeFile() { sideEffects += 1; } },
      { async openMediaFile() { sideEffects += 1; }, refreshViews() { sideEffects += 1; } },
    );

    await assert.rejects(() => service.create(externalResult(), noteForm("")), /請輸入作品名稱/);
    assert.equal(sideEffects, 0);
  });

  it("orchestrates one repository check, path policy, template, and Markdown write", async () => {
    const events: string[] = [];
    let createdContent = "";
    const created = new TFile();
    created.path = "AnimeList/Anime/Example.md";
    const app = {
      vault: {
        async create(path: string, content: string) {
          events.push(`create:${path}`);
          createdContent = content;
          return created;
        },
      },
    } as unknown as App;
    const repository = {
      findBySource(roots: string[], provider: string, sourceId: string) {
        events.push(`find:${roots.join(",")}:${provider}:${sourceId}`);
        return undefined;
      },
    } as unknown as MediaRepository;
    const storage = {
      scanFolders() { return ["AnimeList"]; },
      mediaFolder() { return "AnimeList/Anime"; },
      async ensureFolder(path: string) { events.push(`folder:${path}`); },
      async uniqueFilePath(folder: string, title: string, extension: string) {
        events.push(`path:${folder}:${title}:${extension}`);
        return "AnimeList/Anime/Example.md";
      },
      async readTemplate(path: string) {
        events.push(`template:${path}`);
        return "# {{title}}\n\n```animelist-detail\n```";
      },
    } as unknown as LibraryStorage;
    const service = new MediaNoteService(
      app,
      createDefaultSettings,
      repository,
      storage,
      { async optimizeFile() {} },
      { async openMediaFile() {}, refreshViews() { events.push("refresh"); } },
    );

    const file = await service.create(externalResult(), noteForm());
    assert.equal(file, created);
    assert.deepEqual(events, [
      "find:AnimeList:AniList:42",
      "folder:AnimeList/Anime",
      "path:AnimeList/Anime:Example:md",
      "template:builtin:plain",
      "create:AnimeList/Anime/Example.md",
      "refresh",
    ]);
    assert.match(createdContent, /schema_version: 6/);
    assert.match(createdContent, /title: "Example"/);
    assert.match(createdContent, /# Example/);
  });
  it("stores a manually uploaded cover in the managed cover folder before writing the note", async () => {
    const events: string[] = [];
    let createdMarkdown = "";
    let binaryPath = "";
    let binaryBytes = 0;
    const note = new TFile();
    note.path = "AnimeList/Manga/Manual Work.md";
    const coverFile = new TFile();
    coverFile.path = "AnimeList/Covers/manga/manual-work-manual.png";
    const app = {
      vault: {
        async createBinary(path: string, data: ArrayBuffer) {
          binaryPath = path;
          binaryBytes = data.byteLength;
          events.push(`binary:${path}`);
          return coverFile;
        },
        async create(path: string, content: string) {
          events.push(`create:${path}`);
          createdMarkdown = content;
          return note;
        },
      },
    } as unknown as App;
    const repository = { findBySource() { throw new Error("manual media must not run source lookup without a source id"); } } as unknown as MediaRepository;
    const storage = {
      scanFolders() { return ["AnimeList"]; },
      mediaFolder() { return "AnimeList/Manga"; },
      async ensureFolder(path: string) { events.push(`folder:${path}`); },
      async uniqueFilePath(folder: string, title: string, extension: string) {
        if (extension === "png") return "AnimeList/Covers/manga/manual-work-manual.png";
        return "AnimeList/Manga/Manual Work.md";
      },
      async readTemplate() { return ""; },
    } as unknown as LibraryStorage;
    const settings = createDefaultSettings();
    settings.coverFolder = "AnimeList/Covers";
    const service = new MediaNoteService(
      app,
      () => settings,
      repository,
      storage,
      { async optimizeFile(file) { events.push(`optimize:${file.path}`); } },
      { async openMediaFile() {}, refreshViews() { events.push("refresh"); } },
    );

    const result: ExternalMediaResult = {
      ...externalResult(),
      provider: "manual",
      sourceId: "",
      sourceUrl: "",
      mediaType: "manga",
      format: "manga",
      total: 0,
      unit: "chapter",
      coverUrl: "",
      people: [],
    };
    const form = { ...noteForm("Manual Work"), unit: "chapter", total: 0, progress: "第 7 話", releaseStatus: "unknown" };
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    await service.create(result, form, { name: "cover.png", contentType: "image/png", data: bytes });

    assert.equal(binaryPath, "AnimeList/Covers/manga/manual-work-manual.png");
    assert.equal(binaryBytes, 4);
    assert.ok(events.includes("optimize:AnimeList/Covers/manga/manual-work-manual.png"));
    assert.match(createdMarkdown, /^source_provider: "manual"$/m);
    assert.match(createdMarkdown, /^cover: "AnimeList\/Covers\/manga\/manual-work-manual\.png"$/m);
    assert.match(createdMarkdown, /^progress: "第 7 話"$/m);
  });

  it("rolls back a downloaded cover when Markdown creation fails", async () => {
    const cover = new TFile();
    cover.path = "AnimeList/Covers/manga/failed.png";
    const trashed: string[] = [];
    const app = {
      vault: {
        async createBinary() { return cover; },
        getAbstractFileByPath(path: string) { return path === cover.path ? cover : null; },
        async create() { throw new Error("disk write failed"); },
      },
      fileManager: {
        async trashFile(target: TFile) { trashed.push(target.path); },
      },
    } as unknown as App;
    const repository = { findBySource() { return undefined; } } as unknown as MediaRepository;
    const storage = {
      scanFolders() { return ["AnimeList"]; },
      mediaFolder() { return "AnimeList/Manga"; },
      async ensureFolder() {},
      async uniqueFilePath(_folder: string, _title: string, extension: string) {
        return extension === "png" ? cover.path : "AnimeList/Manga/Failed.md";
      },
      async readTemplate() { return ""; },
    } as unknown as LibraryStorage;
    const settings = createDefaultSettings();
    settings.coverFolder = "AnimeList/Covers";
    const service = new MediaNoteService(
      app,
      () => settings,
      repository,
      storage,
      { async optimizeFile() {} },
      { async openMediaFile() {}, refreshViews() {} },
    );
    const result: ExternalMediaResult = {
      ...externalResult(), provider: "manual", sourceId: "", sourceUrl: "", mediaType: "manga", format: "manga", unit: "chapter",
    };

    await assert.rejects(
      () => service.create(result, { ...noteForm("Failed"), unit: "chapter" }, {
        name: "cover.png", contentType: "image/png", data: new Uint8Array([1, 2]).buffer,
      }),
      /disk write failed/,
    );
    assert.deepEqual(trashed, [cover.path]);
  });

});
