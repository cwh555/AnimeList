import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandTimelineEntries } from "../src/novel-progress";
import { applyReadingProgressSnapshot } from "../src/reading-progress-persistence";
import {
  compareSerialLabels,
  defaultProgressUnit,
  highestCompletedSerialLabel,
  normalizeSerialLabel,
  normalizeSerialLog,
  normalizeSerialProgress,
  progressUnitsFor,
  serializeSerialLog,
} from "../src/progress-units";
import {
  timelineSerialEventTitle,
  timelineSerialLabel,
} from "../src/timeline-entry";
import type { MediaItem } from "../src/types";

describe("reading progress units", () => {
  it("keeps anime on episodes and offers chapter, season, and volume for reading media", () => {
    assert.deepEqual(progressUnitsFor("anime"), ["episode"]);
    assert.deepEqual(progressUnitsFor("manga"), ["chapter", "season", "volume"]);
    assert.deepEqual(progressUnitsFor("novel"), ["chapter", "season", "volume"]);
    assert.equal(defaultProgressUnit("manga", "unknown"), "chapter");
    assert.equal(defaultProgressUnit("novel", "unknown"), "volume");
    assert.equal(defaultProgressUnit("novel", "season"), "season");
  });

  it("uses integer labels for chapters and seasons while preserving flexible volume labels", () => {
    assert.equal(normalizeSerialLabel("12", "chapter"), "12");
    assert.equal(normalizeSerialLabel("2", "season"), "2");
    assert.equal(normalizeSerialLabel("1.5", "season"), null);
    assert.equal(normalizeSerialLabel("EX", "chapter"), null);
    assert.equal(normalizeSerialLabel("7.5", "volume"), "7.5");
    assert.equal(normalizeSerialLabel("ex", "volume"), "EX");
    assert.equal(normalizeSerialLabel("7.2", "volume"), null);
    assert.equal(normalizeSerialProgress("3", "season"), 3);
    assert.equal(normalizeSerialProgress("EX", "volume"), "EX");
  });

  it("normalizes, deduplicates, and serializes dated entries for every reading unit", () => {
    const entries = normalizeSerialLog([
      { label: "3", completed_at: "2026-03-03" },
      { label: "1", started_at: "2026-01-01", completed_at: "2026-01-02" },
      { label: "3", completed_at: "2026-04-04" },
      { label: "2", started_at: "2026-02-01" },
      { label: "1.5", completed_at: "2026-02-15" },
    ], "chapter");

    assert.deepEqual(entries.map((entry) => entry.label), ["1", "2", "3"]);
    assert.deepEqual(serializeSerialLog(entries, "chapter"), [
      { label: "1", started_at: "2026-01-01", completed_at: "2026-01-02" },
      { label: "2", started_at: "2026-02-01" },
      { label: "3", completed_at: "2026-03-03" },
    ]);
    assert.equal(highestCompletedSerialLabel(entries, "chapter"), "3");
  });

  it("orders EX after numeric volumes and raises progress to the highest completed entry", () => {
    const entries = normalizeSerialLog([
      { label: "EX", completed_at: "2026-04-01" },
      { label: "1.5", completed_at: "2026-02-01" },
      { label: "1", completed_at: "2026-01-01" },
    ], "volume");

    assert.deepEqual(entries.map((entry) => entry.label), ["1", "1.5", "EX"]);
    assert.ok(compareSerialLabels("1.5", "EX", "volume") < 0);
    assert.equal(highestCompletedSerialLabel(entries, "volume"), "EX");
  });

  it("formats timeline labels and event titles with the saved reading unit", () => {
    assert.equal(timelineSerialLabel({ title: "漫畫", mediaType: "manga", unit: "chapter" }, "12"), "第 12 話");
    assert.equal(timelineSerialLabel({ title: "小說", mediaType: "novel", unit: "season" }, "2"), "第 2 季");
    assert.equal(timelineSerialLabel({ title: "小說", mediaType: "novel", unit: "volume" }, "7.5"), "第 7.5 卷");
    assert.equal(timelineSerialEventTitle({ title: "冰菓", mediaType: "novel", unit: "chapter" }, "3"), "冰菓 — 第 3 話");
  });

  it("keeps chapter, season, and volume units when expanding dated timeline entries", () => {
    const base = {
      originalTitle: "",
      format: "manga",
      status: "ongoing",
      releaseStatus: "releasing",
      progress: 1,
      total: 0,
      score: null,
      favorite: false,
      year: 2026,
      genres: [],
      people: [],
      platforms: [],
      sourceUrls: [],
      cover: "series.jpg",
      filePath: "Media/item.md",
      updated: 0,
      updatedLabel: "",
      startedAt: "",
      completedAt: "",
    } satisfies Omit<MediaItem, "title" | "mediaType" | "unit" | "volumeLog">;
    const entries = expandTimelineEntries([
      { ...base, title: "章作品", mediaType: "manga", unit: "chapter", volumeLog: [{ label: "10", startedAt: "", completedAt: "2026-01-01" }] },
      { ...base, title: "季作品", mediaType: "novel", unit: "season", volumeLog: [{ label: "2", startedAt: "", completedAt: "2026-01-02" }] },
      { ...base, title: "卷作品", mediaType: "novel", unit: "volume", volumeLog: [{ label: "3", startedAt: "", completedAt: "2026-01-03" }] },
    ]);

    assert.deepEqual(entries.map((entry) => entry.title), [
      "章作品 — 第 10 話",
      "季作品 — 第 2 季",
      "卷作品 — 第 3 卷",
    ]);
    assert.deepEqual(entries.map((entry) => entry.unit), ["chapter", "season", "volume"]);
  });

  it("persists the single reading log and reloads edited entries with metadata", () => {
    const frontmatter: Record<string, unknown> = {
      title: "無職転生",
      volume_log: [{ label: "1", completed_at: "2026-01-01" }],
      unrelated: "keep",
    };

    applyReadingProgressSnapshot(frontmatter, {
      unit: "volume",
      progress: 2,
      entries: [{
        label: "2",
        startedAt: "2026-02-01",
        completedAt: "2026-02-02",
        cover: "volume-2.jpg",
        coverProvider: "Bangumi",
        coverSourceId: "volume-2",
        extra: { isbn: "9780000000002" },
      }],
    });

    assert.equal(frontmatter.progress_unit, "volume");
    assert.equal(frontmatter.progress, 2);
    assert.equal(frontmatter.unrelated, "keep");
    assert.deepEqual(frontmatter.volume_log, [{
      isbn: "9780000000002",
      label: "2",
      started_at: "2026-02-01",
      completed_at: "2026-02-02",
      cover: "volume-2.jpg",
      cover_provider: "Bangumi",
      cover_source_id: "volume-2",
    }]);
    assert.deepEqual(normalizeSerialLog(frontmatter.volume_log, "volume"), [{
      label: "2",
      startedAt: "2026-02-01",
      completedAt: "2026-02-02",
      cover: "volume-2.jpg",
      coverProvider: "Bangumi",
      coverSourceId: "volume-2",
      extra: { isbn: "9780000000002" },
    }]);
  });
});
