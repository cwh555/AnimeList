import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreDashboardDragStackDepth } from "../src/score-dashboard-drag-preview";
import { ScoreDashboardRefreshGuard } from "../src/score-dashboard-refresh";
import {
  applyScoreDashboardSelectionClick,
  parseScoreDashboardDraggedPaths,
  scoreDashboardDraggedPaths,
  serializeScoreDashboardDraggedPaths,
  toggleScoreDashboardPathSelection,
} from "../src/score-dashboard-selection";

describe("score dashboard incremental selection", () => {
  it("updates the existing selection set without rebuilding dashboard data", () => {
    const selected = new Set<string>(["first.md"]);
    assert.equal(toggleScoreDashboardPathSelection(selected, "second.md"), true);
    assert.deepEqual([...selected], ["first.md", "second.md"]);
    assert.equal(toggleScoreDashboardPathSelection(selected, "first.md"), false);
    assert.deepEqual([...selected], ["second.md"]);
  });

  it("keeps a normal click as navigation outside batch mode", () => {
    const selected = new Set<string>();
    assert.deepEqual(applyScoreDashboardSelectionClick(selected, "first.md", false, false), {
      handled: false,
      batchMode: false,
      selected: null,
    });
    assert.equal(selected.size, 0);
  });

  it("enters batch mode and selects the clicked poster on Shift-click", () => {
    const selected = new Set<string>();
    assert.deepEqual(applyScoreDashboardSelectionClick(selected, "first.md", false, true), {
      handled: true,
      batchMode: true,
      selected: true,
    });
    assert.deepEqual([...selected], ["first.md"]);
  });

  it("toggles an existing selection while batch mode is active", () => {
    const selected = new Set<string>(["first.md"]);
    assert.deepEqual(applyScoreDashboardSelectionClick(selected, "first.md", true, false), {
      handled: true,
      batchMode: true,
      selected: false,
    });
    assert.equal(selected.size, 0);
  });
});

describe("score dashboard batch drag payload", () => {
  it("drags all selected paths when the source poster is selected", () => {
    const selected = new Set(["first.md", "second.md", "third.md"]);
    assert.deepEqual(scoreDashboardDraggedPaths("second.md", true, selected), ["first.md", "second.md", "third.md"]);
  });

  it("blocks batch dragging from an unselected poster", () => {
    assert.deepEqual(scoreDashboardDraggedPaths("other.md", true, new Set(["first.md"])), []);
  });

  it("keeps single-poster dragging unchanged outside batch mode", () => {
    assert.deepEqual(scoreDashboardDraggedPaths("first.md", false, new Set()), ["first.md"]);
  });

  it("serializes multiple paths and accepts the legacy single-path payload", () => {
    const payload = serializeScoreDashboardDraggedPaths(["first.md", "second.md", "first.md"]);
    assert.deepEqual(parseScoreDashboardDraggedPaths(payload), ["first.md", "second.md"]);
    assert.deepEqual(parseScoreDashboardDraggedPaths("legacy.md"), ["legacy.md"]);
  });

  it("uses at most two visible cards behind the leading cover", () => {
    assert.equal(scoreDashboardDragStackDepth(1), 0);
    assert.equal(scoreDashboardDragStackDepth(2), 1);
    assert.equal(scoreDashboardDragStackDepth(3), 2);
    assert.equal(scoreDashboardDragStackDepth(30), 2);
  });
});

describe("score dashboard local refresh guard", () => {
  it("suppresses metadata refreshes caused by a local score write", () => {
    const guard = new ScoreDashboardRefreshGuard(1500);
    guard.mark(["anime/example.md"], 1000);
    assert.equal(guard.shouldSuppress("anime/example.md", 1000), true);
    assert.equal(guard.shouldSuppress("anime/example.md", 2499), true);
    assert.equal(guard.shouldSuppress("anime/other.md", 1000), false);
  });

  it("expires and can release guarded paths", () => {
    const guard = new ScoreDashboardRefreshGuard(1500);
    guard.mark(["anime/expired.md", "anime/released.md"], 1000);
    assert.equal(guard.shouldSuppress("anime/expired.md", 2501), false);
    guard.release(["anime/released.md"]);
    assert.equal(guard.shouldSuppress("anime/released.md", 1200), false);
  });
});
