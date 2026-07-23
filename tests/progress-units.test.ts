import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { legacyTest } from "../src/legacy";
import {
  defaultProgressUnit,
  parseProgressForUnit,
  progressUnitsForMediaType,
  synchronizeProgressWithVolumeLog,
} from "../src/progress-units";
import { uiText } from "../src/ui-text";

const readingResult = {
  provider: "manual",
  sourceId: "",
  sourceUrl: "",
  mediaType: "manga",
  title: "Example",
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
  unit: "chapter",
  summary: "",
  externalScore: null,
  releaseStatus: "releasing",
} as const;

const readingForm = {
  title: "Example",
  score: "",
  status: "ongoing",
  releaseStatus: "releasing",
  startedAt: "",
  completedAt: "",
  progress: 2,
  total: 0,
  unit: "season",
  favorite: false,
  genres: [],
  templatePath: "",
  volumeLog: [],
} as const;

describe("progress units", () => {
  it("offers chapter, season, and volume for manga and novels", () => {
    assert.deepEqual(progressUnitsForMediaType("anime"), ["episode"]);
    assert.deepEqual(progressUnitsForMediaType("manga"), ["chapter", "season", "volume"]);
    assert.deepEqual(progressUnitsForMediaType("novel"), ["chapter", "season", "volume"]);
    assert.equal(defaultProgressUnit("manga"), "chapter");
    assert.equal(defaultProgressUnit("novel"), "volume");
  });

  it("preserves an unknown legacy unit while editing", () => {
    assert.deepEqual(progressUnitsForMediaType("manga", "arc"), ["chapter", "season", "volume", "arc"]);
  });

  it("requires whole non-negative values for episodes, chapters, and seasons", () => {
    assert.deepEqual(parseProgressForUnit("3", "season"), { ok: true, value: 3 });
    assert.deepEqual(parseProgressForUnit("1.5", "season"), { ok: false, reason: "integer" });
    assert.deepEqual(parseProgressForUnit("EX", "chapter"), { ok: false, reason: "integer" });
  });

  it("keeps half-volume and EX support for volume progress", () => {
    assert.deepEqual(parseProgressForUnit("1.5", "volume"), { ok: true, value: 1.5 });
    assert.deepEqual(parseProgressForUnit("EX", "volume"), { ok: true, value: "EX" });
  });

  it("only synchronizes completed volume records when progress uses volumes", () => {
    const volumeLog = [{ label: "3", startedAt: "", completedAt: "2026-07-23" }];
    assert.equal(synchronizeProgressWithVolumeLog(2, "season", volumeLog), 2);
    assert.equal(synchronizeProgressWithVolumeLog(2, "chapter", volumeLog), 2);
    assert.equal(synchronizeProgressWithVolumeLog(2, "volume", volumeLog), 3);
  });

  it("serializes the selected reading unit", () => {
    const markdown = legacyTest.buildMediaMarkdown(readingResult, readingForm, "", "");
    assert.match(markdown, /^progress: 2$/m);
    assert.match(markdown, /^progress_unit: "season"$/m);
  });

  it("rejects fractional season progress during serialization", () => {
    assert.throws(
      () => legacyTest.buildMediaMarkdown(readingResult, { ...readingForm, progress: 1.5 }, "", ""),
      new RegExp(uiText("validation.progressInteger", { label: uiText("add.progressReading") })),
    );
  });
});
