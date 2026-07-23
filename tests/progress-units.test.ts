import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultProgressUnit,
  normalizeProgressUnit,
  progressUnitLabel,
  progressUnitOptions,
  validateProgressForUnit,
} from "../src/progress-units";

describe("progress units", () => {
  it("offers episode for anime and chapter, season, volume for reading media", () => {
    assert.deepEqual(
      progressUnitOptions("anime").map((option) => [option.value, option.label]),
      [["episode", "集"]],
    );
    const expected = [["chapter", "話"], ["season", "季"], ["volume", "卷"]];
    assert.deepEqual(progressUnitOptions("manga").map((option) => [option.value, option.label]), expected);
    assert.deepEqual(progressUnitOptions("novel").map((option) => [option.value, option.label]), expected);
  });

  it("keeps media-specific defaults", () => {
    assert.equal(defaultProgressUnit("anime"), "episode");
    assert.equal(defaultProgressUnit("manga"), "chapter");
    assert.equal(defaultProgressUnit("novel"), "volume");
    assert.equal(normalizeProgressUnit("", "novel"), "volume");
  });

  it("preserves unknown legacy units instead of rewriting frontmatter", () => {
    assert.equal(normalizeProgressUnit("arc", "manga"), "arc");
    assert.deepEqual(progressUnitOptions("manga", "arc").at(-1), { value: "arc", label: "arc" });
  });

  it("centralizes unit labels", () => {
    assert.equal(progressUnitLabel("chapter"), "話");
    assert.equal(progressUnitLabel("season"), "季");
    assert.equal(progressUnitLabel("volume"), "卷");
  });

  it("requires whole non-negative progress for chapters and seasons", () => {
    assert.deepEqual(validateProgressForUnit("12", "chapter"), { valid: true, value: 12 });
    assert.deepEqual(validateProgressForUnit("2", "season"), { valid: true, value: 2 });
    assert.equal(validateProgressForUnit("1.5", "season").valid, false);
    assert.equal(validateProgressForUnit("EX", "chapter").valid, false);
    assert.equal(validateProgressForUnit("-1", "chapter").valid, false);
  });

  it("keeps legacy volume progress forms available", () => {
    assert.deepEqual(validateProgressForUnit("2.5", "volume"), { valid: true, value: "2.5" });
    assert.deepEqual(validateProgressForUnit("EX", "volume"), { valid: true, value: "EX" });
  });
});
