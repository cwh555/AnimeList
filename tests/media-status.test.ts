import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MEDIA_STATUS_FILTER_ORDER,
  MEDIA_STATUS_VALUES,
  canonicalMediaStatus,
  mediaStatusMatches,
  normalizeMediaStatus,
  normalizeStatusFilter,
  shouldMigrateMediaStatus,
} from "../src/domain/media-status";

describe("media status domain", () => {
  it("keeps one canonical storage vocabulary", () => {
    assert.deepEqual(MEDIA_STATUS_VALUES, ["planned", "ongoing", "completed", "dropped"]);
    assert.deepEqual(MEDIA_STATUS_FILTER_ORDER, ["ongoing", "completed", "planned", "dropped"]);
  });

  it("normalizes active and paused legacy values", () => {
    for (const value of ["watching", "reading", "active", "on going", "on-going"]) {
      assert.equal(normalizeMediaStatus(value), "ongoing");
    }
    for (const value of ["on_hold", "on hold", "paused"]) {
      assert.equal(normalizeMediaStatus(value), "planned");
    }
  });

  it("does not classify unknown custom values as migratable", () => {
    assert.equal(canonicalMediaStatus("custom-state"), null);
    assert.equal(shouldMigrateMediaStatus("custom-state"), false);
    assert.equal(shouldMigrateMediaStatus("watching"), true);
    assert.equal(shouldMigrateMediaStatus("ongoing"), false);
  });

  it("normalizes saved filters and comparisons through the same rules", () => {
    assert.equal(normalizeStatusFilter("on_hold"), "planned");
    assert.equal(normalizeStatusFilter("reading"), "ongoing");
    assert.equal(normalizeStatusFilter("all"), "all");
    assert.equal(mediaStatusMatches("watching", "ongoing"), true);
    assert.equal(mediaStatusMatches("paused", "planned"), true);
    assert.equal(mediaStatusMatches("completed", "ongoing"), false);
  });
});
