import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ScoreDashboardRefreshGuard } from "../src/score-dashboard-refresh";
import { toggleScoreDashboardPathSelection } from "../src/score-dashboard-ui";

describe("score dashboard incremental selection", () => {
  it("updates the existing selection set without rebuilding dashboard data", () => {
    const selected = new Set<string>(["first.md"]);
    assert.equal(toggleScoreDashboardPathSelection(selected, "second.md"), true);
    assert.deepEqual([...selected], ["first.md", "second.md"]);
    assert.equal(toggleScoreDashboardPathSelection(selected, "first.md"), false);
    assert.deepEqual([...selected], ["second.md"]);
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
