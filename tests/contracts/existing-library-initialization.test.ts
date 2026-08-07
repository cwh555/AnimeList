import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile, TFolder, type App } from "obsidian";
import { AnimeListApplicationServices } from "../../src/app/anime-list-application";
import { createDefaultSettings } from "../../src/settings-model";

function folder(path: string, children: Array<TFile | TFolder> = []): TFolder {
  const value = new TFolder();
  value.path = path;
  value.name = path.split("/").at(-1) ?? path;
  value.children = children;
  return value;
}

function markdown(path: string): TFile {
  const value = new TFile();
  value.path = path;
  value.name = path.split("/").at(-1) ?? path;
  value.basename = value.name.replace(/\.md$/, "");
  value.extension = "md";
  (value as TFile & { stat: { ctime: number; mtime: number; size: number } }).stat = {
    ctime: 0,
    mtime: 1_700_000_000_000,
    size: 1,
  };
  return value;
}

function fixture() {
  const existing = markdown("AnimeList/Anime/existing.md");
  const anime = folder("AnimeList/Anime", [existing]);
  const manga = folder("AnimeList/Manga");
  const novel = folder("AnimeList/Novel");
  const library = folder("AnimeList", [anime, manga, novel]);
  const root = folder("", [library]);
  const files = new Map<string, TFile | TFolder>([
    ["", root],
    [library.path, library],
    [anime.path, anime],
    [manga.path, manga],
    [novel.path, novel],
    [existing.path, existing],
  ]);
  const created: string[] = [];
  const frontmatter = {
    media_type: "anime",
    title: "Existing anime",
    status: "watching",
    progress: 3,
    progress_total: 12,
    progress_unit: "episode",
  };
  const app = {
    vault: {
      getRoot: () => root,
      getAbstractFileByPath: (path: string) => files.get(path) ?? null,
      createFolder: async (path: string) => {
        created.push(path);
        const value = folder(path);
        files.set(path, value);
        return value;
      },
      getResourcePath: (file: TFile) => `app://${file.path}`,
    },
    metadataCache: {
      getFileCache: (file: TFile) => file === existing ? { frontmatter } : null,
      getFirstLinkpathDest: () => null,
    },
  } as unknown as App;
  return { app, existing, frontmatter, created };
}

function application(app: App, settings = createDefaultSettings()): AnimeListApplicationServices {
  return new AnimeListApplicationServices(
    app,
    "animelist",
    () => settings,
    { openMediaFile: async () => {}, refreshViews: () => {} },
  );
}

describe("existing library initialization", () => {
  it("reads pre-existing default AnimeList notes without importing or rewriting them", async () => {
    const { app, existing, frontmatter, created } = fixture();
    const services = application(app);

    await services.initializeLibrary(false);
    const items = services.collectMediaItems();

    assert.deepEqual(created, ["AnimeList/Covers", "AnimeList/Templates"]);
    assert.equal(items.length, 1);
    assert.equal(items[0].filePath, existing.path);
    assert.equal(items[0].title, "Existing anime");
    assert.equal(items[0].status, "ongoing");
    assert.equal(items[0].progress, 3);
    assert.deepEqual(frontmatter, {
      media_type: "anime",
      title: "Existing anime",
      status: "watching",
      progress: 3,
      progress_total: 12,
      progress_unit: "episode",
    });
  });

  it("keeps persisted additional scan folders authoritative for custom existing libraries", () => {
    const { app } = fixture();
    const settings = createDefaultSettings();
    settings.additionalScanFolders = ["Archive"];
    const services = application(app, settings);

    assert.deepEqual(services.getScanFolders(), ["AnimeList", "Archive"]);
  });
});
