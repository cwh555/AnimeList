import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { legacyTest } from "../src/legacy";
import {
  expandMangaReadingTimelineEntries,
  nextReadingProgressValue,
  normalizeReadingProgressLog,
  serializeReadingProgressLog,
  synchronizeMediaReadingProgress,
  volumeEntriesFromReadingProgress,
} from "../src/reading-progress";
import type { MediaItem, ReadingProgressEntry } from "../src/types";

const mixedLog: ReadingProgressEntry[] = [
  { value: 12, unit: "chapter", startedAt: "", completedAt: "2026-07-21" },
  { value: 2, unit: "season", startedAt: "", completedAt: "2026-07-22" },
  { value: 3.5, unit: "volume", startedAt: "2026-07-22", completedAt: "2026-07-23" },
];

describe("manga reading progress records", () => {
  it("normalizes, sorts, and serializes mixed reading units", () => {
    assert.deepEqual(normalizeReadingProgressLog([
      { value: "3.5", unit: "volume", started_at: "2026-07-22", completed_at: "2026-07-23" },
      { value: "2", unit: "season", completed_at: "2026-07-22" },
      { value: "12", unit: "chapter", completed_at: "2026-07-21" },
    ]), mixedLog);
    assert.deepEqual(serializeReadingProgressLog(mixedLog), [
      { value: 12, unit: "chapter", completed_at: "2026-07-21" },
      { value: 2, unit: "season", completed_at: "2026-07-22" },
      { value: 3.5, unit: "volume", started_at: "2026-07-22", completed_at: "2026-07-23" },
    ]);
  });

  it("allows the same number in different units but removes exact duplicates", () => {
    assert.deepEqual(normalizeReadingProgressLog([
      { value: 2, unit: "chapter" },
      { value: "02", unit: "chapter" },
      { value: 2, unit: "season" },
    ]).map((entry) => [entry.value, entry.unit]), [
      [2, "chapter"],
      [2, "season"],
    ]);
  });

  it("generates the next value independently for each unit", () => {
    assert.equal(nextReadingProgressValue(mixedLog, "chapter"), 13);
    assert.equal(nextReadingProgressValue(mixedLog, "season"), 3);
    assert.equal(nextReadingProgressValue(mixedLog, "volume"), 4);
  });

  it("synchronizes main progress only from completed records with the same unit", () => {
    assert.equal(synchronizeMediaReadingProgress("manga", 4, "chapter", mixedLog, []), 12);
    assert.equal(synchronizeMediaReadingProgress("manga", 4, "season", mixedLog, []), 4);
    assert.equal(synchronizeMediaReadingProgress("manga", 2, "volume", mixedLog, []), 3.5);
    assert.equal(synchronizeMediaReadingProgress("manga", 4, "chapter", [
      { value: 20, unit: "chapter", startedAt: "", completedAt: "" },
    ], []), 4);
  });

  it("keeps the legacy novel volume format separate", () => {
    assert.deepEqual(volumeEntriesFromReadingProgress(mixedLog), [{
      label: "3.5",
      startedAt: "2026-07-22",
      completedAt: "2026-07-23",
    }]);
  });

  it("expands completed manga reading records into timeline entries", () => {
    const item: MediaItem = {
      title: "Example manga",
      originalTitle: "",
      mediaType: "manga",
      format: "manga",
      status: "ongoing",
      releaseStatus: "releasing",
      progress: 12,
      total: 0,
      unit: "chapter",
      score: null,
      favorite: false,
      year: 2026,
      genres: [],
      people: [],
      platforms: [],
      sourceUrls: [],
      cover: "cover.jpg",
      filePath: "AnimeList/Manga/example.md",
      updated: 0,
      updatedLabel: "",
      startedAt: "",
      completedAt: "",
      volumeLog: [],
      readingLog: [
        ...mixedLog,
        { value: 13, unit: "chapter", startedAt: "", completedAt: "" },
      ],
    };
    const entries = expandMangaReadingTimelineEntries(item);
    assert.deepEqual(entries.map((entry) => [entry.progressValue, entry.progressUnit]), [
      [12, "chapter"],
      [2, "season"],
      [3.5, "volume"],
    ]);
    assert.ok(entries.every((entry) => entry.seriesTitle === "Example manga"));
  });

  it("writes manga reading_log and preserves EX volume progress", () => {
    const markdown = legacyTest.buildMediaMarkdown({
      provider: "manual",
      sourceId: "",
      sourceUrl: "",
      mediaType: "manga",
      title: "Example manga",
      originalTitle: "",
      romajiTitle: "",
      format: "manga",
      year: 2026,
      coverUrl: "",
      genres: [],
      rawGenres: [],
      people: [],
      platforms: [],
      total: 0,
      unit: "volume",
      summary: "",
      externalScore: null,
      releaseStatus: "releasing",
    }, {
      title: "Example manga",
      score: "",
      status: "ongoing",
      releaseStatus: "releasing",
      startedAt: "",
      completedAt: "",
      progress: "EX",
      total: 0,
      unit: "volume",
      favorite: false,
      genres: [],
      templatePath: "",
      volumeLog: [],
      readingLog: [{ value: "EX", unit: "volume", startedAt: "", completedAt: "2026-07-23" }],
    }, "", "");
    assert.match(markdown, /^progress: "EX"$/m);
    assert.match(markdown, /^progress_unit: "volume"$/m);
    assert.match(markdown, /reading_log:[\s\S]*value: "EX"[\s\S]*unit: "volume"[\s\S]*completed_at: "2026-07-23"/);
  });
});
