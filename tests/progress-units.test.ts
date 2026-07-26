import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
