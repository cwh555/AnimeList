import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App, TFile, TFolder } from "obsidian";
import {
  CURRENT_MEDIA_SCHEMA_VERSION,
  migrateMediaStatusFrontmatter,
  migrateMediaStatusNotes,
} from "../src/app/schema-migration";

function markdownFile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path.split("/").at(-1) ?? path;
  file.basename = file.name.replace(/\.md$/, "");
  file.extension = "md";
  return file;
}

describe("media status schema migration", () => {
  it("changes only recognized legacy statuses and preserves unrelated fields", () => {
    const frontmatter: Record<string, unknown> = {
      schema_version: 5,
      media_type: "anime",
      status: "watching",
      title: "Example",
      custom: { keep: true },
    };
    assert.equal(migrateMediaStatusFrontmatter(frontmatter), "ongoing");
    assert.deepEqual(frontmatter, {
      schema_version: CURRENT_MEDIA_SCHEMA_VERSION,
      media_type: "anime",
      status: "ongoing",
      title: "Example",
      custom: { keep: true },
    });

    const paused = { media_type: "novel", status: "paused", keep: true };
    assert.equal(migrateMediaStatusFrontmatter(paused), "planned");
    assert.deepEqual(paused, {
      media_type: "novel",
      status: "planned",
      schema_version: CURRENT_MEDIA_SCHEMA_VERSION,
      keep: true,
    });

    const unknown = { media_type: "anime", status: "custom-state", keep: true };
    assert.equal(migrateMediaStatusFrontmatter(unknown), null);
    assert.deepEqual(unknown, { media_type: "anime", status: "custom-state", keep: true });
  });

  it("scans configured roots once and updates only migration candidates", async () => {
    const anime = markdownFile("AnimeList/Anime/a.md");
    const manga = markdownFile("AnimeList/Manga/b.md");
    const canonical = markdownFile("AnimeList/Novel/c.md");
    const unrelated = markdownFile("AnimeList/Other/d.md");
    const root = new TFolder();
    root.path = "AnimeList";
    root.name = "AnimeList";
    root.children = [anime, manga, canonical, unrelated];

    const frontmatters = new Map<TFile, Record<string, unknown>>([
      [anime, { media_type: "anime", status: "watching", title: "A" }],
      [manga, { media_type: "manga", status: "on_hold", title: "B" }],
      [canonical, { media_type: "novel", status: "ongoing", title: "C" }],
      [unrelated, { status: "reading", title: "D" }],
    ]);
    const writes: string[] = [];
    const app = {
      vault: {
        getRoot: () => root,
        getAbstractFileByPath: (path: string) => path === "AnimeList" ? root : null,
      },
      metadataCache: {
        getFileCache: (file: TFile) => ({ frontmatter: frontmatters.get(file) }),
      },
      fileManager: {
        processFrontMatter: async (file: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
          writes.push(file.path);
          callback(frontmatters.get(file) ?? {});
        },
      },
    } as unknown as App;

    const result = await migrateMediaStatusNotes(app, ["AnimeList"], 2);
    assert.deepEqual(result, { total: 2, ongoing: 1, planned: 1 });
    assert.deepEqual(writes.sort(), [anime.path, manga.path]);
    assert.equal(frontmatters.get(anime)?.status, "ongoing");
    assert.equal(frontmatters.get(manga)?.status, "planned");
    assert.equal(frontmatters.get(canonical)?.schema_version, undefined);
    assert.equal(frontmatters.get(unrelated)?.status, "reading");
  });
});
