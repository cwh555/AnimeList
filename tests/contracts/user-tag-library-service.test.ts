import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App, TFile, TFolder } from "obsidian";
import { UserTagLibraryService } from "../../src/data/user-tag-library-service";

function mediaFile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path.split("/").at(-1) ?? path;
  file.basename = file.name.replace(/\.md$/, "");
  file.extension = "md";
  return file;
}

describe("user tag library service", () => {
  it("renames and deletes a global tag across media notes without touching unrelated frontmatter or Markdown", async () => {
    const first = mediaFile("AnimeList/Anime/first.md");
    const second = mediaFile("AnimeList/Anime/second.md");
    const unrelated = mediaFile("AnimeList/notes.md");
    const root = new TFolder();
    root.path = "AnimeList";
    root.children = [first, second, unrelated];

    const frontmatters = new Map<TFile, Record<string, unknown>>([
      [first, {
        media_type: "anime",
        genres: ["戀愛"],
        user_tags: ["重看"],
        classification_genres: ["校園"],
        source_genres: ["2024年4月"],
        tags: ["obsidian-tag"],
        custom: { keep: true },
      }],
      [second, {
        media_type: "manga",
        genres: ["重看", "收藏"],
        source_provider: "bangumi",
        custom: "keep",
      }],
      [unrelated, { title: "not media", genres: ["重看"] }],
    ]);
    let processCalls = 0;
    let markdownWrites = 0;
    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => path === "AnimeList" ? root : null,
        getRoot: () => new TFolder(),
        modify: async () => { markdownWrites += 1; },
      },
      metadataCache: {
        getFileCache: (file: TFile) => ({ frontmatter: frontmatters.get(file) }),
      },
      fileManager: {
        processFrontMatter: async (file: TFile, update: (frontmatter: Record<string, unknown>) => void) => {
          processCalls += 1;
          update(frontmatters.get(file) ?? {});
        },
      },
    } as unknown as App;

    const service = new UserTagLibraryService(app, () => ["AnimeList"]);
    assert.deepEqual(service.collect(), ["戀愛", "重看", "校園", "重看", "收藏"]);
    assert.equal(processCalls, 0);
    assert.equal(markdownWrites, 0);

    const renamed = await service.rename("重看", "稍後重看");
    assert.equal(renamed.changedNotes, 2);
    assert.equal(processCalls, 2);
    assert.equal(markdownWrites, 0);
    assert.deepEqual(frontmatters.get(first)?.genres, ["戀愛", "稍後重看", "校園"]);
    assert.equal("user_tags" in (frontmatters.get(first) ?? {}), false);
    assert.equal("classification_genres" in (frontmatters.get(first) ?? {}), false);
    assert.deepEqual(frontmatters.get(first)?.source_genres, ["2024年4月"]);
    assert.deepEqual(frontmatters.get(first)?.tags, ["obsidian-tag"]);
    assert.deepEqual(frontmatters.get(first)?.custom, { keep: true });
    assert.deepEqual(frontmatters.get(second)?.genres, ["稍後重看", "收藏"]);
    assert.deepEqual(frontmatters.get(unrelated)?.genres, ["重看"]);

    const removed = await service.remove("校園");
    assert.equal(removed.changedNotes, 1);
    assert.equal(processCalls, 3);
    assert.deepEqual(frontmatters.get(first)?.genres, ["戀愛", "稍後重看"]);
    assert.deepEqual(frontmatters.get(first)?.source_genres, ["2024年4月"]);
    assert.deepEqual(frontmatters.get(first)?.tags, ["obsidian-tag"]);
  });
});
