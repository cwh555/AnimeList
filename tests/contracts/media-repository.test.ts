import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App, TFile, TFolder } from "obsidian";
import { MediaRepository } from "../../src/data/media-repository";
import { formatFileModifiedTime } from "../../src/domain/value-normalization";

function markdownFile(path: string, mtime = 0): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path.split("/").at(-1) ?? path;
  file.basename = file.name.replace(/\.md$/, "");
  file.extension = "md";
  (file as TFile & { stat: { mtime: number } }).stat = { mtime };
  return file;
}

describe("media repository compatibility", () => {
  it("normalizes one authoritative library representation", () => {
    const modified = 1_700_000_000_000;
    const anime = markdownFile("AnimeList/Anime/example.md", modified);
    const ignored = markdownFile("AnimeList/Notes/readme.md");
    const cover = new TFile();
    cover.path = "AnimeList/Covers/example.jpg";
    cover.name = "example.jpg";
    cover.basename = "example";
    cover.extension = "jpg";
    const root = new TFolder();
    root.path = "AnimeList";
    root.children = [anime, ignored];

    const frontmatters = new Map<TFile, Record<string, unknown>>([
      [anime, {
        media_type: "anime",
        title: "Example",
        title_original: "原題",
        status: "watching",
        release_status: "finished",
        progress: 4,
        progress_total: 12,
        progress_unit: "episode",
        score: "8.5",
        favorite: true,
        year: 2024,
        genres: ["Romance", "恋爱", "Comedy"],
        studios: ["Studio A"],
        source_provider: "AniList",
        source_id: 42,
        cover: "![[AnimeList/Covers/example.jpg|260]]",
      }],
      [ignored, { title: "Not media" }],
    ]);
    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => path === "AnimeList" ? root : path === cover.path ? cover : null,
        getResourcePath: (file: TFile) => `app://${file.path}`,
      },
      metadataCache: {
        getFileCache: (file: TFile) => ({ frontmatter: frontmatters.get(file) }),
        getFirstLinkpathDest: (path: string) => path === cover.path ? cover : null,
      },
    } as unknown as App;

    const repository = new MediaRepository(app);
    const items = repository.collect(["AnimeList"]);
    assert.equal(items.length, 1);
    assert.deepEqual(items[0], {
      title: "Example",
      originalTitle: "原題",
      mediaType: "anime",
      format: "anime",
      status: "ongoing",
      releaseStatus: "finished",
      progress: 4,
      total: 12,
      unit: "episode",
      score: 8.5,
      favorite: true,
      year: 2024,
      genres: ["戀愛", "喜劇"],
      people: ["Studio A"],
      platforms: [],
      sourceUrls: [],
      cover: `app://${cover.path}`,
      coverSources: undefined,
      filePath: anime.path,
      updated: modified,
      updatedLabel: `更新於 ${formatFileModifiedTime(modified)}`,
      startedAt: "",
      completedAt: "",
      volumeLog: [],
    });
    assert.equal(repository.findBySource(["AnimeList"], "AniList", "42"), anime);
  });

  it("updates only favorite metadata and preserves unrelated fields", async () => {
    const media = markdownFile("AnimeList/Anime/example.md");
    const frontmatter: Record<string, unknown> = {
      media_type: "anime",
      favorite: false,
      updated_at: "legacy",
      metadata_updated_at: "legacy",
      custom: { keep: true },
    };
    const app = {
      vault: { getAbstractFileByPath: (path: string) => path === media.path ? media : null },
      fileManager: {
        processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => update(frontmatter),
      },
    } as unknown as App;

    await new MediaRepository(app).setFavorite(media.path, true);
    assert.deepEqual(frontmatter, {
      media_type: "anime",
      favorite: true,
      custom: { keep: true },
    });
  });
});
