import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareSerialLabels,
  defaultProgressUnit,
  highestCompletedSerialLabel,
  normalizeSerialLabel,
  normalizeSerialLog,
  normalizeReadingProgressValue,
  normalizeSerialProgress,
  progressUnitsFor,
  serializeSerialLog,
} from "../src/domain/progress-units";

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
    assert.equal(normalizeReadingProgressValue("第 12 話 / Web版"), "第 12 話 / Web版");
    assert.equal(normalizeReadingProgressValue(" 12 "), 12);
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


});
