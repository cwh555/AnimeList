import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MOMENT_STACK_GAP,
  MAX_MOMENT_STACK_GAP,
  MIN_MOMENT_STACK_GAP,
  momentImageLayoutState,
  momentStackAverageGap,
  momentStackGapAfterDrag,
  momentStackGapsWithDelta,
  momentStackOffsetsY,
  normalizeMomentImageLayout,
  normalizeMomentStackGapsY,
} from "../src/domain/moment-image-layout";

describe("Moment stacked image layout", () => {
  it("keeps legacy and explicit carousel moments on the existing filmstrip layout", () => {
    assert.equal(normalizeMomentImageLayout(undefined), "carousel");
    assert.deepEqual(momentImageLayoutState({}, 4), {});
    assert.deepEqual(momentImageLayoutState({ imageLayout: "carousel", stackGapsY: [0, 80] }, 4), {});
    assert.deepEqual(momentImageLayoutState({ imageLayout: "stacked" }, 1), {});
  });

  it("normalizes one vertical gap per image and derives cumulative whole-image offsets", () => {
    assert.deepEqual(normalizeMomentStackGapsY(undefined, 4), [0, 46, 46, 46]);
    assert.deepEqual(normalizeMomentStackGapsY([99, 2, 999, "75"], 4), [0, MIN_MOMENT_STACK_GAP, MAX_MOMENT_STACK_GAP, 75]);
    assert.deepEqual(momentStackOffsetsY([0, 52, 58], 3), [0, 52, 110]);

    assert.deepEqual(momentImageLayoutState({
      imageLayout: "STACKED",
      stackGapsY: [0, 52.4, 61],
    }, 3), {
      imageLayout: "stacked",
      stackGapsY: [0, 52, 61],
    });
  });

  it("moves a stacked image by changing its gap instead of changing a crop focus", () => {
    assert.equal(momentStackGapAfterDrag(52, -12), 40);
    assert.equal(momentStackGapAfterDrag(52, 18), 70);
    assert.equal(momentStackGapAfterDrag(30, -100), MIN_MOMENT_STACK_GAP);
    assert.equal(momentStackGapAfterDrag(90, 100), MAX_MOMENT_STACK_GAP);
  });

  it("adjusts overall reveal while preserving per-layer differences until bounded", () => {
    assert.equal(momentStackAverageGap([0, 40, 60], 3), 50);
    assert.equal(momentStackAverageGap([], 0), DEFAULT_MOMENT_STACK_GAP);
    assert.deepEqual(momentStackGapsWithDelta([0, 40, 60], 3, 8), [0, 48, 68]);
    assert.deepEqual(momentStackGapsWithDelta([0, 30, 94], 3, 10), [0, 40, MAX_MOMENT_STACK_GAP]);
  });
});
