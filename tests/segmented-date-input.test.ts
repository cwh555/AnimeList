import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDateParts } from "../src/segmented-date-input";

describe("segmented serial date input", () => {
  it("accepts only complete real calendar dates", () => {
    assert.equal(normalizeDateParts("2026", "07", "27"), "2026-07-27");
    assert.equal(normalizeDateParts("2026", "02", "29"), "");
    assert.equal(normalizeDateParts("2024", "02", "29"), "2024-02-29");
    assert.equal(normalizeDateParts("2026", "7", "27"), "");
    assert.equal(normalizeDateParts("", "", ""), "");
  });
});
