import assert from "node:assert/strict";
import test from "node:test";
import {
  MOMENT_STACK_COPY_MAX_HEIGHT,
  MOMENT_STACK_COPY_MAX_PIXELS,
  MOMENT_STACK_COPY_MAX_WIDTH,
  planMomentStackRaster,
} from "../src/ui/moment-stack-raster";

test("stacked Moment copy scales the saved whole-image gaps with the output raster", () => {
  const plan = planMomentStackRaster({
    topImageWidth: 960,
    topImageHeight: 540,
    displayWidth: 760,
    imageCount: 3,
    gapsY: [0, 56, 64],
    pixelRatio: 2,
  });
  assert.equal(plan.width, 1520);
  assert.equal(plan.topHeight, 855);
  assert.deepEqual(plan.offsetsY, [0, 112, 240]);
  assert.equal(plan.height, 1095);
});

test("stacked Moment copy bounds temporary canvas memory for very deep stacks", () => {
  const imageCount = 120;
  const plan = planMomentStackRaster({
    topImageWidth: 3840,
    topImageHeight: 2160,
    displayWidth: 760,
    imageCount,
    gapsY: [0, ...Array.from({ length: imageCount - 1 }, () => 96)],
    pixelRatio: 4,
  });
  assert.ok(plan.width <= MOMENT_STACK_COPY_MAX_WIDTH);
  assert.ok(plan.height <= MOMENT_STACK_COPY_MAX_HEIGHT);
  assert.ok(plan.width * plan.height <= MOMENT_STACK_COPY_MAX_PIXELS);
  assert.ok(plan.scale < 2);
});

test("stacked Moment copy rejects invalid source dimensions instead of allocating a canvas", () => {
  assert.throws(() => planMomentStackRaster({
    topImageWidth: 0,
    topImageHeight: 540,
    displayWidth: 760,
    imageCount: 2,
    gapsY: [0, 46],
  }), /invalid dimensions/i);
});
