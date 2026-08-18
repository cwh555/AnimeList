import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MOMENT_STACK_FOCUS_Y,
  DEFAULT_MOMENT_STACK_REVEAL,
  MAX_MOMENT_STACK_REVEAL,
  MIN_MOMENT_STACK_REVEAL,
  momentImageLayoutState,
  momentStackFocusAfterDrag,
  normalizeMomentImageLayout,
  normalizeMomentStackFocusY,
  normalizeMomentStackReveal,
} from "../src/domain/moment-image-layout";

describe("Moment stacked image layout", () => {
  it("keeps legacy and explicit carousel moments on the existing filmstrip layout", () => {
    assert.equal(normalizeMomentImageLayout(undefined), "carousel");
    assert.deepEqual(momentImageLayoutState({}, 4), {});
    assert.deepEqual(momentImageLayoutState({ imageLayout: "carousel", stackReveal: 88 }, 4), {});
    assert.deepEqual(momentImageLayoutState({ imageLayout: "stacked" }, 1), {});
  });

  it("normalizes stacked reveal height and one focus value per image", () => {
    assert.equal(normalizeMomentStackReveal(undefined), DEFAULT_MOMENT_STACK_REVEAL);
    assert.equal(normalizeMomentStackReveal(2), MIN_MOMENT_STACK_REVEAL);
    assert.equal(normalizeMomentStackReveal(999), MAX_MOMENT_STACK_REVEAL);
    assert.deepEqual(normalizeMomentStackFocusY([20, 110, "75"], 4), [20, 100, 75, DEFAULT_MOMENT_STACK_FOCUS_Y]);

    assert.deepEqual(momentImageLayoutState({
      imageLayout: "STACKED",
      stackReveal: 53.4,
      stackFocusY: [50, 82, 91],
    }, 3), {
      imageLayout: "stacked",
      stackReveal: 53,
      stackFocusY: [50, 82, 91],
    });
  });

  it("turns a vertical drag into a bounded crop focus without changing reveal height", () => {
    assert.equal(momentStackFocusAfterDrag(80, -20), 89);
    assert.equal(momentStackFocusAfterDrag(80, 20), 71);
    assert.equal(momentStackFocusAfterDrag(5, 100), 0);
    assert.equal(momentStackFocusAfterDrag(95, -100), 100);
  });
});
