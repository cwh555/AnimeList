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
});
