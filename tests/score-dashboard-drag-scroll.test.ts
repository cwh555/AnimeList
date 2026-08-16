import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  scoreDashboardDragScrollDelta,
  scoreDashboardDragScrollVelocity,
} from "../src/domain/score-dashboard/drag-scroll";

const options = { edgeSize: 100, minSpeed: 2, maxSpeed: 22 };

describe("score dashboard drag auto-scroll", () => {
  it("does not scroll while the pointer stays outside the edge zones", () => {
    assert.equal(scoreDashboardDragScrollVelocity(300, 0, 600, options), 0);
  });

  it("scrolls upward near the top and downward near the bottom", () => {
    assert.ok(scoreDashboardDragScrollVelocity(50, 0, 600, options) < 0);
    assert.ok(scoreDashboardDragScrollVelocity(550, 0, 600, options) > 0);
  });

  it("accelerates as the pointer approaches an edge", () => {
    const nearTop = Math.abs(scoreDashboardDragScrollVelocity(10, 0, 600, options));
    const fartherFromTop = Math.abs(scoreDashboardDragScrollVelocity(70, 0, 600, options));
    assert.ok(nearTop > fartherFromTop);

    const nearBottom = scoreDashboardDragScrollVelocity(590, 0, 600, options);
    const fartherFromBottom = scoreDashboardDragScrollVelocity(530, 0, 600, options);
    assert.ok(nearBottom > fartherFromBottom);
  });

  it("stops at the scroll boundaries and clamps the final step", () => {
    const base = {
      pointerY: 10,
      viewportTop: 0,
      viewportBottom: 600,
      scrollHeight: 1600,
      clientHeight: 600,
    };
    assert.equal(scoreDashboardDragScrollDelta({ ...base, scrollTop: 0 }, options), 0);
    assert.equal(scoreDashboardDragScrollDelta({ ...base, pointerY: 590, scrollTop: 1000 }, options), 0);
    assert.equal(scoreDashboardDragScrollDelta({ ...base, pointerY: 590, scrollTop: 997 }, options), 3);
  });
});
