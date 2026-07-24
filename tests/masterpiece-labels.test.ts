import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MASTERPIECE_LABEL,
  collectMasterpieceLabels,
  deleteMasterpieceLabel,
  labelsForMasterpieceEnable,
  normalizeMasterpieceLabels,
  normalizeSpecialLabelMode,
  renameMasterpieceLabel,
  stateAfterFavoriteChange,
  stateAfterMasterpieceSelection,
} from "../src/masterpiece-labels";

describe("masterpiece label domain", () => {
  it("keeps favorite as the backward-compatible default mode", () => {
    assert.equal(normalizeSpecialLabelMode(undefined), "favorite");
    assert.equal(normalizeSpecialLabelMode("favorite"), "favorite");
    assert.equal(normalizeSpecialLabelMode("masterpiece"), "masterpiece");
  });

  it("creates the default masterpiece category for legacy favorites", () => {
    assert.deepEqual(labelsForMasterpieceEnable([]), [DEFAULT_MASTERPIECE_LABEL]);
    assert.deepEqual(labelsForMasterpieceEnable(undefined), [DEFAULT_MASTERPIECE_LABEL]);
  });

  it("allows one title to belong to multiple reusable categories", () => {
    const state = stateAfterMasterpieceSelection([
      "戀愛番 masterpiece",
      "校園番 masterpiece",
      "戀愛番 masterpiece",
    ]);
    assert.equal(state.favorite, true);
    assert.deepEqual(state.masterpieceLabels, ["戀愛番 masterpiece", "校園番 masterpiece"]);
  });

  it("removes only the default category when favorite is disabled", () => {
    assert.deepEqual(stateAfterFavoriteChange([DEFAULT_MASTERPIECE_LABEL], false), {
      favorite: false,
      masterpieceLabels: [],
    });
    assert.deepEqual(stateAfterFavoriteChange([
      DEFAULT_MASTERPIECE_LABEL,
      "戀愛番 masterpiece",
    ], false), {
      favorite: false,
      masterpieceLabels: ["戀愛番 masterpiece"],
    });
  });

  it("preserves custom categories while favorite mode is active", () => {
    assert.deepEqual(stateAfterFavoriteChange(["動作番 masterpiece"], true), {
      favorite: true,
      masterpieceLabels: ["動作番 masterpiece"],
    });
  });

  it("normalizes, renames, deletes, and collects categories without duplicates", () => {
    assert.deepEqual(normalizeMasterpieceLabels(["  A  ", "a", "B", {}]), ["A", "B"]);
    assert.deepEqual(renameMasterpieceLabel(["A", "B"], "A", "B"), ["B"]);
    assert.deepEqual(deleteMasterpieceLabel(["A", "B"], "a"), ["B"]);
    assert.deepEqual(collectMasterpieceLabels([
      { favorite: true, masterpieceLabels: [] },
      { masterpieceLabels: ["B", "A"] },
      { masterpieceLabels: ["a", "C"] },
    ]), ["A", "B", "C", DEFAULT_MASTERPIECE_LABEL]);
  });
});
