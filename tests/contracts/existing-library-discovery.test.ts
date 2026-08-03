import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile, type App } from "obsidian";
import { AnimeListApplicationServices } from "../../src/app/anime-list-application";
import { createDefaultSettings } from "../../src/settings-model";

function markdownFile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path.split("/").at(-1) ?? path;
  file.basename = file.name.replace(/\.md$/, "");
  file.extension = "md";
  return file;
}

function services(files: TFile[], frontmatters: Map<TFile, Record<string, unknown> | null>) {
  const settings = createDefaultSettings();
  const app = {
    vault: {
      getMarkdownFiles: () => files,
    },
    metadataCache: {
      getFileCache: (file: TFile) => {
        const frontmatter = frontmatters.get(file);
        return frontmatter === null ? null : { frontmatter };
      },
    },
  } as unknown as App;
  return new AnimeListApplicationServices(
    app,
    "animelist",
    () => settings,
    {
      searchBangumi: async () => [],
      searchAniList: async () => [],
      searchOpenLibrary: async () => [],
    },
    { openMediaFile: async () => {}, refreshViews: () => {} },
  );
}

describe("existing library initialization", () => {
  it("adds existing custom AnimeList data to scan roots without changing storage settings", () => {
    const configured = markdownFile("AnimeList/Anime/configured.md");
    const legacyAnime = markdownFile("Archive/Anime/legacy.md");
    const legacyNovel = markdownFile("Books/legacy.md");
    const ordinary = markdownFile("Notes/ordinary.md");
    const frontmatters = new Map<TFile, Record<string, unknown> | null>([
      [configured, { media_type: "anime" }],
      [legacyAnime, { media_type: "anime" }],
      [legacyNovel, { media_type: "novel" }],
      [ordinary, { title: "ordinary" }],
    ]);

    const application = services([configured, legacyAnime, legacyNovel, ordinary], frontmatters);
    assert.deepEqual(application.getScanFolders(), ["AnimeList", "Archive", "Books"]);
  });

  it("retries discovery while metadata cache entries are unresolved", () => {
    const legacy = markdownFile("Archive/Manga/legacy.md");
    const frontmatters = new Map<TFile, Record<string, unknown> | null>([[legacy, null]]);
    const application = services([legacy], frontmatters);

    assert.deepEqual(application.getScanFolders(), ["AnimeList"]);
    frontmatters.set(legacy, { media_type: "manga" });
    assert.deepEqual(application.getScanFolders(), ["AnimeList", "Archive"]);
  });

  it("discovers an existing media note stored directly at the vault root", () => {
    const legacy = markdownFile("legacy.md");
    const application = services(
      [legacy],
      new Map([[legacy, { media_type: "anime" }]]),
    );
    assert.deepEqual(application.getScanFolders(), ["AnimeList", "/"]);
  });
});
