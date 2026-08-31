import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRating, normalizeRating, stepRating } from "../src/domain/rating";

describe("rating domain", () => {
  it("keeps ratings that already use half-point increments", () => {
    assert.deepEqual(normalizeRating(0), {
      kind: "valid", value: 0, changed: false, original: 0,
    });
    assert.deepEqual(normalizeRating("7.5"), {
      kind: "valid", value: 7.5, changed: false, original: 7.5,
    });
    assert.deepEqual(normalizeRating(10), {
      kind: "valid", value: 10, changed: false, original: 10,
    });
  });

  it("rounds legacy and newly entered ratings to the nearest half point", () => {
    assert.deepEqual(normalizeRating("7.2"), {
      kind: "valid", value: 7, changed: true, original: 7.2,
    });
    assert.deepEqual(normalizeRating("7.3"), {
      kind: "valid", value: 7.5, changed: true, original: 7.3,
    });
    assert.deepEqual(normalizeRating("7.25"), {
      kind: "valid", value: 7.5, changed: true, original: 7.25,
    });
    assert.deepEqual(normalizeRating("9.9"), {
      kind: "valid", value: 10, changed: true, original: 9.9,
    });
  });

  it("steps ratings explicitly in half-point increments and clamps the range", () => {
    assert.equal(stepRating("9", 1), 9.5);
    assert.equal(stepRating("9", -1), 8.5);
    assert.equal(stepRating("7.2", 1), 7.5);
    assert.equal(stepRating(10, 1), 10);
    assert.equal(stepRating(0, -1), 0);
    assert.equal(stepRating("", 1), null);
    assert.equal(stepRating("invalid", -1), null);
  });

  it("leaves empty, invalid, and out-of-range values for existing validation", () => {
    assert.deepEqual(normalizeRating(""), { kind: "empty", value: null, changed: false });
    assert.deepEqual(normalizeRating("not-a-number"), { kind: "invalid", value: null, changed: false });
    assert.deepEqual(normalizeRating(-0.1), { kind: "out-of-range", value: -0.1, changed: false });
    assert.deepEqual(normalizeRating(10.1), { kind: "out-of-range", value: 10.1, changed: false });
  });

  it("formats persisted ratings with one decimal place", () => {
    assert.equal(formatRating(7), "7.0");
    assert.equal(formatRating(7.5), "7.5");
  });
});
