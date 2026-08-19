import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MediaItem } from "../src/types";
import { libraryExportRecordFromItem } from "../src/data/library-export-service";
import {
  ANIMELIST_LIBRARY_EXPORT_FORMAT,
  ANIMELIST_LIBRARY_EXPORT_VERSION,
  serializeLibraryExportDocument,
  type LibraryExportDocumentV1,
} from "../src/domain/library-export";
import {
  LibraryImportError,
  libraryImportMatchCandidates,
  parseLibraryImportJson,
} from "../src/domain/library-import";

function fixture(): LibraryExportDocumentV1 {
  return {
    format: ANIMELIST_LIBRARY_EXPORT_FORMAT,
    version: ANIMELIST_LIBRARY_EXPORT_VERSION,
    exportedAt: "2026-08-19T01:00:00.000Z",
    records: [{
      title: "葬送的芙莉蓮",
      originalTitle: "葬送のフリーレン",
      mediaType: "manga",
      format: "manga",
      status: "ongoing",
      releaseStatus: "releasing",
      progress: { current: 14, unit: "volume" },
      score: 9,
      favorite: true,
      dates: { startedAt: "2025-01-03" },
      serialEntries: [
        { label: "13", completedAt: "2026-05-03" },
        { label: "14", completedAt: "2026-06-12" },
      ],
      metadata: { year: 2020, genres: ["Fantasy"], mediaTags: ["Magic"] },
      source: {
        provider: "bangumi",
        id: "305429",
        anilistId: "118586",
        urls: ["https://example.com/frieren"],
      },
      notePath: "AnimeList/Manga/葬送的芙莉蓮.md",
      cover: { path: "AnimeList/Covers/frieren.jpg", remote: "https://example.com/frieren.jpg" },
    }],
  };
}

function importErrorCode(callback: () => unknown): string {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof LibraryImportError);
    return error.code;
  }
  assert.fail("Expected LibraryImportError");
}

describe("library import contract", () => {
  it("accepts JSON produced from the current Export record builder without losing reconstructable Library state", () => {
    const media: MediaItem = {
      title: "葬送的芙莉蓮", originalTitle: "葬送のフリーレン", mediaType: "manga", format: "manga",
      status: "ongoing", releaseStatus: "releasing", progress: 14, total: 0, unit: "volume", score: 9,
      favorite: true, year: 2020, genres: ["Fantasy"], mediaTags: ["Magic"], people: [], platforms: [],
      sourceUrls: ["https://example.com/frieren"], cover: "", filePath: "AnimeList/Manga/葬送的芙莉蓮.md",
      updated: 0, updatedLabel: "", startedAt: "2025-01-03", completedAt: "",
      volumeLog: [
        { label: "13", startedAt: "", completedAt: "2026-05-03" },
        { label: "14", startedAt: "", completedAt: "2026-06-12" },
      ],
      anilistId: "118586",
    };
    const document = fixture();
    document.records = [libraryExportRecordFromItem(media, {
      source_provider: "Bangumi", source_id: "305429", anilist_id: "118586",
    })];
    const parsed = parseLibraryImportJson(serializeLibraryExportDocument(document));
    const record = parsed.records[0];

    assert.equal(record.title, "葬送的芙莉蓮");
    assert.equal(record.mediaType, "manga");
    assert.equal(record.status, "ongoing");
    assert.deepEqual(record.progress, { current: 14, unit: "volume" });
    assert.deepEqual(record.serialEntries?.map((entry) => [entry.label, entry.completedAt]), [
      ["13", "2026-05-03"],
      ["14", "2026-06-12"],
    ]);
    assert.equal(record.source?.provider, "bangumi");
    assert.equal(record.source?.id, "305429");
    assert.equal(record.source?.anilistId, "118586");
  });

  it("produces future Import matching candidates in source → AniList → title order", () => {
    const record = fixture().records[0];
    assert.deepEqual(libraryImportMatchCandidates(record), [
      { kind: "source", provider: "bangumi", id: "305429" },
      { kind: "anilist", id: "118586" },
      { kind: "title", mediaType: "manga", title: "葬送的芙莉蓮" },
    ]);
  });

  it("rejects invalid JSON, foreign formats, unsupported versions, and malformed nested records", () => {
    assert.equal(importErrorCode(() => parseLibraryImportJson("{")), "invalid-json");
    assert.equal(importErrorCode(() => parseLibraryImportJson(JSON.stringify({
      ...fixture(), format: "other-format",
    }))), "wrong-format");
    assert.equal(importErrorCode(() => parseLibraryImportJson(JSON.stringify({
      ...fixture(), version: 2,
    }))), "unsupported-version");

    const malformed = fixture() as unknown as { records: Array<Record<string, unknown>> };
    malformed.records[0].serialEntries = [{ label: 13, completedAt: "2026-05-03" }];
    assert.equal(importErrorCode(() => parseLibraryImportJson(JSON.stringify(malformed))), "invalid-document");
  });
});
