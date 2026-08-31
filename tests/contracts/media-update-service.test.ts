import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App, TFile } from "obsidian";
import { MediaUpdateService } from "../../src/data/media-update-service";
import type { MediaNoteForm } from "../../src/domain/media-types";

function animeForm(): MediaNoteForm {
  return {
    title: "Updated title",
    status: "ongoing",
    releaseStatus: "unknown",
    progress: 5,
    total: 12,
    unit: "episode",
    score: 8.5,
    favorite: true,
    startedAt: "2026-01-01",
    completedAt: "",
    genres: ["戀愛", "重看", "收藏"],
    templatePath: "",
    volumeLog: [],
  };
}

function setFilePath(file: TFile, path: string): void {
  file.path = path;
  file.basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  file.extension = "md";
}

describe("media update service", () => {
  it("updates editable fields while preserving unknown frontmatter and note body", async () => {
    const file = new TFile();
    file.path = "AnimeList/Anime/example.md";
    const frontmatter: Record<string, unknown> = {
      schema_version: 5,
      media_type: "anime",
      title: "Old title",
      source_provider: "AniList",
      source_id: "42",
      media_tags: ["School"],
      user_tags: ["old-tag"],
      tags: ["obsidian-tag-must-stay"],
      season: "spring",
      season_year: 2026,
      source_material: "manga",
      country_of_origin: "JP",
      anilist_id: "42",
      custom_nested: { keep: [1, 2, 3] },
      updated_at: "legacy",
      metadata_updated_at: "legacy",
    };
    const body = "# Old title\n\nCustom body must remain unchanged.";
    let bodyAfter = body;
    let processCalls = 0;
    let modifyCalls = 0;
    let refreshes = 0;
    const app = {
      fileManager: {
        processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => {
          processCalls += 1;
          update(frontmatter);
        },
      },
      vault: {
        modify: async () => {
          modifyCalls += 1;
          bodyAfter = "modified";
        },
      },
    } as unknown as App;

    await new MediaUpdateService(app, { refreshViews: () => { refreshes += 1; } })
      .update(file, "anime", animeForm());

    assert.equal(processCalls, 1);
    assert.equal(modifyCalls, 0);
    assert.equal(refreshes, 1);
    assert.equal(bodyAfter, body);
    assert.deepEqual(frontmatter.custom_nested, { keep: [1, 2, 3] });
    assert.equal(frontmatter.source_provider, "AniList");
    assert.equal(frontmatter.source_id, "42");
    assert.deepEqual(frontmatter.media_tags, ["School"]);
    assert.equal("user_tags" in frontmatter, false);
    assert.deepEqual(frontmatter.genres, ["戀愛", "重看", "收藏"]);
    assert.deepEqual(frontmatter.tags, ["obsidian-tag-must-stay"]);
    assert.equal(frontmatter.season, "spring");
    assert.equal(frontmatter.season_year, 2026);
    assert.equal(frontmatter.source_material, "manga");
    assert.equal(frontmatter.country_of_origin, "JP");
    assert.equal(frontmatter.anilist_id, "42");
    assert.equal(frontmatter.schema_version, 6);
    assert.equal(frontmatter.title, "Updated title");
    assert.equal(frontmatter.progress, 5);
    assert.equal(frontmatter.progress_total, 12);
    assert.equal(frontmatter.score, 8.5);
    assert.equal(frontmatter.favorite, true);
    assert.equal(frontmatter.updated_at, undefined);
    assert.equal(frontmatter.metadata_updated_at, undefined);
  });

  it("does not refresh after validation rejects an invalid edit", async () => {
    const file = new TFile();
    file.path = "AnimeList/Anime/example.md";
    const frontmatter: Record<string, unknown> = { media_type: "anime", custom: "keep" };
    let refreshes = 0;
    const app = {
      fileManager: {
        processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => update(frontmatter),
      },
    } as unknown as App;
    const form = animeForm();
    form.title = "";

    await assert.rejects(
      new MediaUpdateService(app, { refreshViews: () => { refreshes += 1; } })
        .update(file, "anime", form),
      /請輸入作品名稱/,
    );
    assert.equal(refreshes, 0);
    assert.deepEqual(frontmatter, { media_type: "anime", custom: "keep" });
  });

  it("edits a stable v1.2.1 note without deleting legacy source data, custom tags, or body", async () => {
    const file = new TFile();
    file.path = "AnimeList/Anime/legacy-v121.md";
    const frontmatter: Record<string, unknown> = {
      schema_version: 6,
      title: "Legacy title",
      title_original: "旧作",
      media_type: "anime",
      format: "tv",
      status: "planned",
      progress: 0,
      progress_total: 12,
      progress_unit: "episode",
      favorite: false,
      year: 2021,
      cover: "![[AnimeList/Covers/legacy.jpg|260]]",
      cover_remote: "https://example.com/legacy.jpg",
      genres: ["Romance"],
      source_genres: ["School", "2021年1月"],
      studios: ["Legacy Studio"],
      platforms: ["TV"],
      source_provider: "bangumi",
      source_id: "123",
      source_urls: ["https://bgm.tv/subject/123"],
      source_score: 7.8,
      note_template: "AnimeList/Templates/anime.md",
      tags: ["obsidian-project-tag"],
      custom_future_field: { keep: true },
    };
    const originalBody = "# Legacy title\n\nKeep this body exactly as written.";
    let bodyAfter = originalBody;
    let modifyCalls = 0;
    const app = {
      fileManager: {
        processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => update(frontmatter),
      },
      vault: {
        modify: async () => {
          modifyCalls += 1;
          bodyAfter = "unexpected body rewrite";
        },
      },
    } as unknown as App;

    const form = animeForm();
    form.genres = ["戀愛", "重看", "收藏"];
    await new MediaUpdateService(app, { refreshViews: () => undefined }).update(file, "anime", form);

    assert.equal(modifyCalls, 0);
    assert.equal(bodyAfter, originalBody);
    assert.equal(frontmatter.schema_version, 6);
    assert.equal(frontmatter.title_original, "旧作");
    assert.equal(frontmatter.format, "tv");
    assert.equal(frontmatter.year, 2021);
    assert.equal(frontmatter.cover, "![[AnimeList/Covers/legacy.jpg|260]]");
    assert.equal(frontmatter.cover_remote, "https://example.com/legacy.jpg");
    assert.deepEqual(frontmatter.source_genres, ["School", "2021年1月"]);
    assert.deepEqual(frontmatter.studios, ["Legacy Studio"]);
    assert.deepEqual(frontmatter.platforms, ["TV"]);
    assert.equal(frontmatter.source_provider, "bangumi");
    assert.equal(frontmatter.source_id, "123");
    assert.deepEqual(frontmatter.source_urls, ["https://bgm.tv/subject/123"]);
    assert.equal(frontmatter.source_score, 7.8);
    assert.equal(frontmatter.note_template, "AnimeList/Templates/anime.md");
    assert.deepEqual(frontmatter.tags, ["obsidian-project-tag"]);
    assert.deepEqual(frontmatter.custom_future_field, { keep: true });
    assert.equal("user_tags" in frontmatter, false);
    assert.deepEqual(frontmatter.genres, ["戀愛", "重看", "收藏"]);
  });

  it("migrates legacy user_tags into the unified editable tag set on save", async () => {
    const file = new TFile();
    file.path = "AnimeList/Anime/example.md";
    const frontmatter: Record<string, unknown> = {
      schema_version: 6,
      media_type: "anime",
      title: "Example",
      user_tags: ["old-personal-tag"],
      classification_genres: ["legacy-selected-tag"],
      media_tags: ["School"],
      tags: ["obsidian-tag"],
    };
    const app = {
      fileManager: {
        processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => update(frontmatter),
      },
    } as unknown as App;
    const form = animeForm();
    form.genres = ["old-personal-tag"];

    await new MediaUpdateService(app, { refreshViews: () => undefined }).update(file, "anime", form);

    assert.equal("user_tags" in frontmatter, false);
    assert.equal("classification_genres" in frontmatter, false);
    assert.deepEqual(frontmatter.genres, ["old-personal-tag"]);
    assert.deepEqual(frontmatter.media_tags, ["School"]);
    assert.deepEqual(frontmatter.tags, ["obsidian-tag"]);
  });

  it("renames the note in place when the stored title is actually changed", async () => {
    const file = new TFile();
    setFilePath(file, "AnimeList/Anime/Old title.md");
    const frontmatter: Record<string, unknown> = { media_type: "anime", title: "Old title" };
    const renames: string[] = [];
    let refreshes = 0;
    const app = {
      metadataCache: { getFileCache: () => ({ frontmatter }) },
      vault: { getAbstractFileByPath: () => null },
      fileManager: {
        renameFile: async (target: TFile, path: string) => { renames.push(path); setFilePath(target, path); },
        processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => update(frontmatter),
      },
    } as unknown as App;
    const form = animeForm();
    form.title = "New / title";

    await new MediaUpdateService(app, { refreshViews: () => { refreshes += 1; } }).update(file, "anime", form);

    assert.deepEqual(renames, ["AnimeList/Anime/New title.md"]);
    assert.equal(file.path, "AnimeList/Anime/New title.md");
    assert.equal(frontmatter.title, "New / title");
    assert.equal(refreshes, 1);
  });

  it("uses the same collision suffix policy as note creation", async () => {
    const file = new TFile();
    setFilePath(file, "AnimeList/Anime/Old.md");
    const occupied = new TFile();
    setFilePath(occupied, "AnimeList/Anime/New title.md");
    const frontmatter: Record<string, unknown> = { media_type: "anime", title: "Old" };
    const renames: string[] = [];
    const app = {
      metadataCache: { getFileCache: () => ({ frontmatter }) },
      vault: { getAbstractFileByPath: (path: string) => path === occupied.path ? occupied : null },
      fileManager: {
        renameFile: async (target: TFile, path: string) => { renames.push(path); setFilePath(target, path); },
        processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => update(frontmatter),
      },
    } as unknown as App;
    const form = animeForm();
    form.title = "New title";

    await new MediaUpdateService(app, { refreshViews: () => undefined }).update(file, "anime", form);

    assert.deepEqual(renames, ["AnimeList/Anime/New title (2).md"]);
  });

  it("does not silently migrate an old mismatched filename when this edit did not change title", async () => {
    const file = new TFile();
    setFilePath(file, "AnimeList/Anime/Very old filename.md");
    const frontmatter: Record<string, unknown> = { media_type: "anime", title: "Current title" };
    let renameCalls = 0;
    const app = {
      metadataCache: { getFileCache: () => ({ frontmatter }) },
      vault: { getAbstractFileByPath: () => null },
      fileManager: {
        renameFile: async () => { renameCalls += 1; },
        processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => update(frontmatter),
      },
    } as unknown as App;
    const form = animeForm();
    form.title = "Current title";

    await new MediaUpdateService(app, { refreshViews: () => undefined }).update(file, "anime", form);

    assert.equal(renameCalls, 0);
    assert.equal(file.path, "AnimeList/Anime/Very old filename.md");
  });

  it("rolls the filename back if frontmatter persistence fails after a title rename", async () => {
    const file = new TFile();
    setFilePath(file, "AnimeList/Anime/Old title.md");
    const frontmatter: Record<string, unknown> = { media_type: "anime", title: "Old title" };
    const renames: string[] = [];
    let refreshes = 0;
    const app = {
      metadataCache: { getFileCache: () => ({ frontmatter }) },
      vault: { getAbstractFileByPath: () => null },
      fileManager: {
        renameFile: async (target: TFile, path: string) => { renames.push(path); setFilePath(target, path); },
        processFrontMatter: async () => { throw new Error("write failed"); },
      },
    } as unknown as App;
    const form = animeForm();
    form.title = "New title";

    await assert.rejects(
      new MediaUpdateService(app, { refreshViews: () => { refreshes += 1; } }).update(file, "anime", form),
      /write failed/,
    );

    assert.deepEqual(renames, ["AnimeList/Anime/New title.md", "AnimeList/Anime/Old title.md"]);
    assert.equal(file.path, "AnimeList/Anime/Old title.md");
    assert.equal(frontmatter.title, "Old title");
    assert.equal(refreshes, 0);
  });
});
