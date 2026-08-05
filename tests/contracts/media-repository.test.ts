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
        media_tags: ["School", "Coming of Age"],
        user_tags: ["重看", "收藏"],
        season: "spring",
        season_year: 2024,
        source_material: "manga",
        country_of_origin: "JP",
        anilist_id: "42",
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
      genres: ["戀愛", "喜劇", "重看", "收藏"],
      mediaTags: ["School", "Coming of Age"],
      userTags: ["重看", "收藏"],
      season: "spring",
      seasonYear: 2024,
      sourceMaterial: "manga",
      countryOfOrigin: "JP",
      anilistId: "42",
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

  it("formats modified labels in the active local timezone", () => {
    const previousTimezone = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      assert.equal(formatFileModifiedTime(1_700_000_000_000), "2023-11-14 22:13");

      process.env.TZ = "Asia/Taipei";
      assert.equal(formatFileModifiedTime(1_700_000_000_000), "2023-11-15 06:13");
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });

  it("loads stable v1.2.1 schema-6 notes without requiring any new metadata fields", () => {
    const file = markdownFile("AnimeList/Anime/legacy-v121.md", 1_700_000_000_000);
    const root = new TFolder();
    root.path = "AnimeList";
    root.children = [file];
    const oldFrontmatter: Record<string, unknown> = {
      schema_version: 6,
      title: "Legacy anime",
      title_original: "旧作",
      media_type: "anime",
      format: "tv",
      status: "planned",
      progress: 0,
      progress_total: 12,
      progress_unit: "episode",
      favorite: false,
      year: 2021,
      genres: ["Romance", "Comedy"],
      source_genres: ["School", "2021年1月"],
      studios: ["Legacy Studio"],
      platforms: ["TV"],
      source_provider: "bangumi",
      source_id: "123",
      source_urls: ["https://bgm.tv/subject/123"],
      source_score: 7.8,
      note_template: "AnimeList/Templates/anime.md",
    };
    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => path === "AnimeList" ? root : null,
        getResourcePath: () => "",
      },
      metadataCache: {
        getFileCache: () => ({ frontmatter: oldFrontmatter }),
        getFirstLinkpathDest: () => null,
      },
    } as unknown as App;

    const item = new MediaRepository(app).read(file);
    assert.ok(item);
    assert.equal(item.title, "Legacy anime");
    assert.deepEqual(item.genres, ["戀愛", "喜劇"]);
    assert.deepEqual(item.people, ["Legacy Studio"]);
    assert.deepEqual(item.sourceUrls, ["https://bgm.tv/subject/123"]);
    assert.deepEqual(item.mediaTags, []);
    assert.deepEqual(item.userTags, []);
    assert.equal(item.season, "");
    assert.equal(item.seasonYear, "");
    assert.equal(item.sourceMaterial, "");
    assert.equal(item.countryOfOrigin, "");
    assert.equal(item.anilistId, "");
  });
});
