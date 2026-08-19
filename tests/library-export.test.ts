import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile } from "obsidian";
import type { MediaItem } from "../src/types";
import {
  ANIMELIST_LIBRARY_EXPORT_FORMAT,
  ANIMELIST_LIBRARY_EXPORT_VERSION,
  buildLibraryTextExportRows,
  isLibraryExportDocumentV1,
  serializeLibraryExportDocument,
  sortLibraryExportRecords,
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

describe("library export", () => {
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

  it("sorts JSON records deterministically", () => {
    const records = [
      libraryExportRecordFromItem(item(file("AnimeList/Novel/z.md"), "Zeta")),
      libraryExportRecordFromItem(item(file("AnimeList/Anime/b.md"), "Beta")),
      libraryExportRecordFromItem(item(file("AnimeList/Anime/a.md"), "Alpha")),
    ];
    records[0].mediaType = "novel";
    records[0].format = "novel";

    assert.deepEqual(sortLibraryExportRecords(records).map((record) => record.title), ["Alpha", "Beta", "Zeta"]);
  });

  it("uses shared Timeline completion semantics and readable serial-unit Text", () => {
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
    const text = formatLibraryTextExport(
      rows,
      "({$作品類型}) {$作品名稱} : {$完成時間} | {$評分}",
    );
    assert.equal(text, [
      "(漫畫) Serial — 第 1 卷 : 2026-01-03 | 9",
      "",
      "(漫畫) Serial — 第 2 卷 : 2026-01-12 | 9",
      "",
      "(動畫) Anime Done : 2026-02-10 | 8.5",
      "",
    ].join("\n"));
  });
});
