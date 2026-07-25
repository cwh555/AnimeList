import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { masterpieceActionText } from "../src/masterpiece-feature-text";
import {
  DEFAULT_MASTERPIECE_LABEL,
  collectMasterpieceLabels,
  deleteMasterpieceLabel,
  groupMasterpieceItems,
  labelsForMasterpieceEnable,
  normalizeMasterpieceLabels,
  normalizeSpecialLabelMode,
  matchesSpecialLabelFilter,
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

  it("uses the same masterpiece action wording for card and edit controls", () => {
    assert.equal(masterpieceActionText(false), "加入 masterpiece");
    assert.equal(masterpieceActionText(true), "編輯 masterpiece");
  });

  it("creates the default masterpiece category for legacy favorites", () => {
    assert.deepEqual(labelsForMasterpieceEnable([]), [DEFAULT_MASTERPIECE_LABEL]);
    assert.deepEqual(labelsForMasterpieceEnable(undefined), [DEFAULT_MASTERPIECE_LABEL]);
  });

  it("allows one title to belong to multiple reusable categories", () => {
    const state = stateAfterMasterpieceSelection([
      "戀愛",
      "年度",
      "戀愛",
    ]);
    assert.equal(state.favorite, true);
    assert.deepEqual(state.masterpieceLabels, ["戀愛", "年度"]);
  });

  it("groups by the exact user-entered category name and permits repeated titles", () => {
    const shared = { id: "shared", favorite: true, masterpieceLabels: ["戀愛", "年度"] };
    const groups = groupMasterpieceItems([
      shared,
      { id: "romance", favorite: true, masterpieceLabels: ["戀愛"] },
      { id: "legacy", favorite: true, masterpieceLabels: [] },
      { id: "retained", favorite: false, masterpieceLabels: ["保留分類"] },
    ]);

    assert.deepEqual(new Set(groups.map((group) => group.label)), new Set(["masterpiece", "年度", "戀愛"]));
    assert.deepEqual(groups.find((group) => group.label === "戀愛")?.items.map((item) => item.id), [
      "shared",
      "romance",
    ]);
    assert.deepEqual(groups.find((group) => group.label === "年度")?.items.map((item) => item.id), ["shared"]);
    assert.deepEqual(groups.find((group) => group.label === "masterpiece")?.items.map((item) => item.id), ["legacy"]);
    assert.equal(groups.some((group) => group.label.includes("戀愛 masterpiece")), false);
  });

  it("removes only the default category when favorite is disabled", () => {
    assert.deepEqual(stateAfterFavoriteChange([DEFAULT_MASTERPIECE_LABEL], false), {
      favorite: false,
      masterpieceLabels: [],
    });
    assert.deepEqual(stateAfterFavoriteChange([
      DEFAULT_MASTERPIECE_LABEL,
      "戀愛",
    ], false), {
      favorite: false,
      masterpieceLabels: ["戀愛"],
    });
  });

  it("preserves custom categories while favorite mode is active", () => {
    assert.deepEqual(stateAfterFavoriteChange(["動作"], true), {
      favorite: true,
      masterpieceLabels: ["動作"],
    });
  });

  it("matches the favorite list through the shared status-filter extension", () => {
    assert.equal(matchesSpecialLabelFilter({ favorite: true }, "favorite"), true);
    assert.equal(matchesSpecialLabelFilter({ favorite: false }, "favorite"), false);
    assert.equal(matchesSpecialLabelFilter({ favorite: true }, "completed"), undefined);
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
