import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile, TFolder, type App } from "obsidian";
import { MediaLibraryIndex } from "../src/data/media-library-index";
import type { MediaItem } from "../src/types";
import type { MediaRepository } from "../src/data/media-repository";
import {
  ANIMELIST_LIBRARY_EXPORT_FORMAT,
  ANIMELIST_LIBRARY_EXPORT_VERSION,
  buildLibraryTextExportRows,
  LIBRARY_TEXT_EXPORT_FIELDS,
  isLibraryExportDocumentV1,
  serializeLibraryExportDocument,
} from "../src/domain/library-export";
import { libraryExportRecordFromItem } from "../src/data/library-export-service";
import { formatLibraryTextExport } from "../src/features/library-export/format";

function file(path: string): TFile {
  const value = new TFile();
  value.path = path;
  value.name = path.split("/").at(-1) ?? path;
  value.basename = value.name.replace(/\.md$/, "");
  value.extension = "md";
  return value;
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

describe("library export model", () => {
  it("serializes a versioned compact record without filesystem-derived or arbitrary frontmatter data", () => {
    const source = item(file("AnimeList/Manga/demo.md"), "Demo");
    Object.assign(source, {
      mediaType: "manga",
      format: "manga",
      status: "ongoing",
      releaseStatus: "releasing",
      progress: 2,
      unit: "volume",
      score: 9,
      favorite: true,
      anilistId: "1234",
      sourceUrls: ["https://example.com/demo"],
      volumeLog: [{ label: "1", startedAt: "2026-01-01", completedAt: "2026-01-02", extra: { ignored: true } }],
      updated: 123456,
      updatedLabel: "filesystem label",
    });
    const record = libraryExportRecordFromItem(source, {
      title_romaji: "Demo Romaji",
      source_provider: "Bangumi",
      source_id: 42,
      source_score: 7.8,
      note_template: "Templates/Manga.md",
    });
    const document = {
      format: ANIMELIST_LIBRARY_EXPORT_FORMAT,
      version: ANIMELIST_LIBRARY_EXPORT_VERSION,
      exportedAt: "2026-08-19T01:00:00.000Z",
      records: [record],
    };
    const serialized = serializeLibraryExportDocument(document);
    const parsed = JSON.parse(serialized);

    assert.equal(isLibraryExportDocumentV1(parsed), true);
    assert.equal(parsed.records[0].source.provider, "bangumi");
    assert.equal(parsed.records[0].source.id, "42");
    assert.equal(parsed.records[0].romajiTitle, "Demo Romaji");
    assert.equal(parsed.records[0].serialEntries[0].label, "1");
    assert.doesNotMatch(serialized, /source_score|note_template|ignored|filesystem label|123456/);
  });

  it("uses shared Timeline completion semantics and selected Text columns", () => {
    const manga = item(file("AnimeList/Manga/serial.md"), "Serial");
    Object.assign(manga, {
      mediaType: "manga",
      format: "manga",
      status: "completed",
      progress: 2,
      unit: "volume",
      score: 9,
      completedAt: "2026-02-20",
      volumeLog: [
        { label: "1", startedAt: "2026-01-01", completedAt: "2026-01-03" },
        { label: "2", startedAt: "2026-01-10", completedAt: "2026-01-12" },
      ],
    });
    const anime = item(file("AnimeList/Anime/done.md"), "Anime Done");
    Object.assign(anime, { status: "completed", completedAt: "2026-02-10", score: 8.5 });
    const rows = buildLibraryTextExportRows([manga, anime]);

    assert.deepEqual(rows.map((row) => [row.time, row.work, row.entryLabel]), [
      ["2026-01-03", "Serial", "1"],
      ["2026-01-12", "Serial", "2"],
      ["2026-02-10", "Anime Done", undefined],
    ]);
    assert.equal(rows.some((row) => row.time === "2026-02-20"), false);
    assert.deepEqual(LIBRARY_TEXT_EXPORT_FIELDS.includes("entry" as never), false);
    const text = formatLibraryTextExport(rows, new Set(["score"]));
    assert.equal(text, [
      "2026-01-03",
      "Serial — 第 1 卷",
      "  評分：9",
      "",
      "2026-01-12",
      "Serial — 第 2 卷",
      "  評分：9",
      "",
      "2026-02-10",
      "Anime Done",
      "  評分：8.5",
      "",
    ].join("\n"));
    assert.doesNotMatch(text, /\|/);
    assert.doesNotMatch(text, /進度|分類／標籤/);
  });
});
