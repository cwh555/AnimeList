import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANIMELIST_LIBRARY_EXPORT_FORMAT,
  ANIMELIST_LIBRARY_EXPORT_VERSION,
  buildLibraryTextExportRows,
  filterLibraryExportItems,
  isLibraryExportDocumentV1,
  serializeLibraryExportDocument,
  type LibraryExportDocumentV1,
} from "../src/domain/library-export";
import type { MediaItem } from "../src/domain/media-types";
import { LibraryExportService, libraryExportRecordFromItem } from "../src/data/library-export-service";
import { formatLibraryTextExport } from "../src/features/library-export/format";

function item(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    title: "Demo",
    originalTitle: "原題",
    mediaType: "anime",
    format: "tv",
    status: "completed",
    releaseStatus: "finished",
    progress: 12,
    total: 12,
    unit: "episode",
    score: 8.5,
    favorite: false,
    year: 2026,
    genres: ["Fantasy"],
    mediaTags: ["Magic"],
    userTags: [],
    season: "spring",
    seasonYear: 2026,
    sourceMaterial: "manga",
    countryOfOrigin: "JP",
    anilistId: "1234",
    people: ["Studio A"],
    platforms: ["TV"],
    sourceUrls: ["https://example.com/demo"],
    cover: "app://cover",
    filePath: "AnimeList/Anime/Demo.md",
    updated: 123456,
    updatedLabel: "updated label",
    startedAt: "2026-01-01",
    completedAt: "2026-03-30",
    volumeLog: [],
    ...overrides,
  };
}

describe("Library export domain", () => {
  it("builds a compact portable record from Library state plus canonical provenance", () => {
    const manga = item({
      title: "Manga",
      mediaType: "manga",
      format: "manga",
      status: "ongoing",
      releaseStatus: "releasing",
      progress: 2,
      total: 0,
      unit: "volume",
      score: 9,
      favorite: true,
      people: ["Author"],
      volumeLog: [{
        label: "1",
        startedAt: "2026-01-01",
        completedAt: "2026-01-02",
        cover: "AnimeList/Covers/v1.jpg",
        coverProvider: "openlibrary",
        coverSourceId: "book-1",
        coverManual: true,
        extra: { obsolete_internal: "do-not-export" },
      }],
      filePath: "AnimeList/Manga/Manga.md",
    });
    const record = libraryExportRecordFromItem(manga, {
      title_romaji: "Manga Romaji",
      source_provider: "Bangumi",
      source_id: 42,
      source_score: 7.8,
      note_template: "Templates/Manga.md",
      cover: "AnimeList/Covers/manga.jpg",
      cover_remote: "https://example.com/manga.jpg",
    });

    assert.equal(record.originalTitle, undefined);
    assert.equal(record.romajiTitle, "Manga Romaji");
    assert.equal(record.source?.provider, "bangumi");
    assert.equal(record.source?.id, "42");
    assert.equal(record.source?.anilistId, "1234");
    assert.equal(record.progress.unit, "volume");
    assert.equal(record.progress.total, undefined);
    assert.equal(record.releaseStatus, "releasing");
    assert.deepEqual(record.cover, {
      path: "AnimeList/Covers/manga.jpg",
      remote: "https://example.com/manga.jpg",
    });
    assert.deepEqual(record.serialEntries, [{
      label: "1",
      startedAt: "2026-01-01",
      completedAt: "2026-01-02",
      cover: {
        path: "AnimeList/Covers/v1.jpg",
        provider: "openlibrary",
        sourceId: "book-1",
        manual: true,
      },
    }]);
    const encoded = JSON.stringify(record);
    assert.doesNotMatch(encoded, /source_score|note_template|obsolete_internal|updatedLabel|123456/);
  });

  it("serializes a versioned deterministic JSON contract that is recognizable for future Import", () => {
    const first = libraryExportRecordFromItem(item({ title: "Zeta", mediaType: "novel", filePath: "Z.md" }));
    const second = libraryExportRecordFromItem(item({ title: "Alpha", mediaType: "anime", filePath: "A.md" }));
    const document: LibraryExportDocumentV1 = {
      format: ANIMELIST_LIBRARY_EXPORT_FORMAT,
      version: ANIMELIST_LIBRARY_EXPORT_VERSION,
      exportedAt: "2026-08-19T01:00:00.000Z",
      records: [first, second],
    };
    const serialized = serializeLibraryExportDocument(document);
    const parsed = JSON.parse(serialized);

    assert.equal(isLibraryExportDocumentV1(parsed), true);
    assert.equal(parsed.records[0].title, "Alpha");
    assert.equal(parsed.records[1].title, "Zeta");
    assert.equal(parsed.format, "animelist-library-export");
    assert.equal(parsed.version, 1);
  });

  it("saves JSON with the recognizable .animelist.json extension under the Library export folder", async () => {
    const created: Array<[string, string]> = [];
    const service = new LibraryExportService({
      settings: { libraryRoot: "AnimeList" },
      ensureFolder: async (path: string) => { assert.equal(path, "AnimeList/Exports"); },
      uniqueFilePath: async (folder: string, baseName: string, extension: string) => {
        assert.equal(folder, "AnimeList/Exports");
        assert.equal(baseName, "AnimeList-2026-08-19");
        assert.equal(extension, "animelist.json");
        return `${folder}/${baseName}.${extension}`;
      },
      app: { vault: { create: async (path: string, content: string) => { created.push([path, content]); } } },
    } as never);

    const path = await service.saveToVault("{\"format\":\"animelist-library-export\"}", "json", new Date(2026, 7, 19));

    assert.equal(path, "AnimeList/Exports/AnimeList-2026-08-19.animelist.json");
    assert.deepEqual(created, [[path, "{\"format\":\"animelist-library-export\"}"]]);
  });

  it("filters JSON/Text scope without changing the source items", () => {
    const source = [
      item({ title: "Anime", mediaType: "anime", status: "completed" }),
      item({ title: "Manga", mediaType: "manga", status: "ongoing" }),
      item({ title: "Novel", mediaType: "novel", status: "planned" }),
    ];
    const filtered = filterLibraryExportItems(source, { mediaType: "manga", status: "ongoing" });
    assert.deepEqual(filtered.map((entry) => entry.title), ["Manga"]);
    assert.equal(source.length, 3);
  });

  it("shares Timeline completion semantics: serial records split, while whole-work completion is fallback only", () => {
    const rows = buildLibraryTextExportRows([
      item({ title: "Anime", completedAt: "2026-02-10" }),
      item({
        title: "Manga",
        mediaType: "manga",
        format: "manga",
        status: "completed",
        unit: "volume",
        progress: 2,
        total: 0,
        completedAt: "2026-02-20",
        volumeLog: [
          { label: "1", startedAt: "2026-01-01", completedAt: "2026-01-03" },
          { label: "2", startedAt: "2026-01-10", completedAt: "2026-01-12" },
        ],
      }),
      item({ title: "Watching", status: "ongoing", completedAt: "" }),
    ]);

    assert.deepEqual(rows.map((row) => [row.time, row.work, row.entryLabel]), [
      ["2026-01-03", "Manga", "1"],
      ["2026-01-12", "Manga", "2"],
      ["2026-02-10", "Anime", undefined],
    ]);
    assert.equal(rows.some((row) => row.time === "2026-02-20"), false);
  });

  it("formats Text with mandatory Time/Work plus selected optional columns", () => {
    const rows = buildLibraryTextExportRows([
      item({
        title: "Manga",
        mediaType: "manga",
        format: "manga",
        status: "ongoing",
        unit: "volume",
        progress: 3,
        total: 0,
        score: 9,
        completedAt: "",
        volumeLog: [{ label: "3", startedAt: "2026-05-01", completedAt: "2026-05-03" }],
      }),
    ]);
    const text = formatLibraryTextExport(rows, new Set(["entry", "mediaType", "score", "startedAt"]));

    assert.match(text, /^Time \| Work \| Entry \/ unit \| Media type \| Score \| Started at$/m);
    assert.match(text, /2026-05-03 \| Manga \| 第 3 卷 \| 漫畫 \| 9 \| 2026-05-01/);
    assert.doesNotMatch(text, /Progress|Genres/);
  });
});
