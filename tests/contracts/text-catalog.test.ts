import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { masterpieceFeatureText } from "../../src/masterpiece-feature-text";
import {
  PROGRESS_UNIT_FEATURE_TEXT,
  progressUnitFeatureText,
} from "../../src/progress-unit-feature-text";
import { RATING_FEATURE_TEXT, ratingFeatureText } from "../../src/rating-feature-text";
import { scoreDashboardText } from "../../src/score-dashboard-text";
import { searchFeatureText } from "../../src/search-feature-text";
import { SERIAL_COVER_TEXT, serialCoverText } from "../../src/serial-cover-text";
import { UI_TEXT, uiText } from "../../src/ui-text";

function assertNonEmptyCatalog(catalog: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value === "string") assert.ok(value.trim(), `${key} must not be empty`);
    else assert.equal(typeof value, "function", `${key} must be text or a formatter`);
  }
}

describe("user-visible text catalog compatibility", () => {
  it("keeps every exported catalog entry non-empty", () => {
    assertNonEmptyCatalog(UI_TEXT);
    assertNonEmptyCatalog(RATING_FEATURE_TEXT);
    assertNonEmptyCatalog(SERIAL_COVER_TEXT);
    assertNonEmptyCatalog(scoreDashboardText);
    assertNonEmptyCatalog(PROGRESS_UNIT_FEATURE_TEXT.unit);
    assertNonEmptyCatalog(Object.fromEntries(
      Object.entries(PROGRESS_UNIT_FEATURE_TEXT).filter(([key]) => key !== "unit"),
    ));
  });

  it("interpolates named variables without deleting unknown future placeholders", () => {
    assert.equal(
      uiText("library.resultMeta", { shown: 2, total: 8, genre: " · 戀愛" }),
      "顯示 2，共 8 部 · 戀愛",
    );
    assert.equal(
      progressUnitFeatureText("timelineEntryTitle", { title: "作品", label: 3, unit: "卷" }),
      "作品 — 第 3 卷",
    );
    assert.equal(
      serialCoverText("settings.progressCount", { completed: 4, total: 10 }),
      "4 / 10",
    );
    assert.match(uiText("library.resultMeta", { shown: 1, total: 2 }), /\{genre}/);
  });

  it("keeps feature text helpers stable for later locale replacement", () => {
    assert.equal(ratingFeatureText("adjusted", { original: 8.2, rounded: 8 }), "評分 8.2 不符合 0.5 分級距，已四捨五入為 8。");
    assert.equal(searchFeatureText("duplicate.warning.open"), "開啟既有筆記");
    assert.equal(masterpieceFeatureText("modal.save"), "儲存");
    assert.equal(scoreDashboardText.selected(3), "已選 3 部");
  });
});
