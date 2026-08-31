import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveImageSectionDragHit, type ImageSectionDragHitGeometry } from "../src/ui/image-section-drag-hit-testing";

const horizontalGeometry: ImageSectionDragHitGeometry<string> = {
  width: 500,
  height: 150,
  maxBottom: 100,
  terminalRegionValue: "c",
  regions: [
    { value: "a", left: 0, top: 0, right: 120, bottom: 100 },
    { value: "c", left: 128, top: 0, right: 248, bottom: 100 },
  ],
};

describe("Image Section drag hit hysteresis", () => {
  it("holds the current card across small horizontal boundary jitter and switches only after a deliberate crossing", () => {
    assert.deepEqual(resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: 130, y: 50, currentRegionValue: "a", currentIsAppend: false,
    }), { kind: "hold" });
    assert.equal(resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: 160, y: 50, currentRegionValue: "a", currentIsAppend: false,
    }).kind, "region");
    assert.deepEqual(resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: 118, y: 50, currentRegionValue: "c", currentIsAppend: false,
    }), { kind: "hold" });
    const returned = resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: 90, y: 50, currentRegionValue: "c", currentIsAppend: false,
    });
    assert.equal(returned.kind, "region");
    if (returned.kind === "region") assert.equal(returned.region.value, "a");
  });

  it("applies the same dead zone to vertical masonry neighbours", () => {
    const geometry: ImageSectionDragHitGeometry<string> = {
      width: 160, height: 240, maxBottom: 208, terminalRegionValue: "bottom",
      regions: [
        { value: "top", left: 0, top: 0, right: 120, bottom: 100 },
        { value: "bottom", left: 0, top: 108, right: 120, bottom: 208 },
      ],
    };
    assert.deepEqual(resolveImageSectionDragHit({
      geometry, x: 60, y: 110, currentRegionValue: "top", currentIsAppend: false,
    }), { kind: "hold" });
    const down = resolveImageSectionDragHit({
      geometry, x: 60, y: 140, currentRegionValue: "top", currentIsAppend: false,
    });
    assert.equal(down.kind, "region");
    if (down.kind === "region") assert.equal(down.region.value, "bottom");
    assert.deepEqual(resolveImageSectionDragHit({
      geometry, x: 60, y: 98, currentRegionValue: "bottom", currentIsAppend: false,
    }), { kind: "hold" });
    const up = resolveImageSectionDragHit({
      geometry, x: 60, y: 70, currentRegionValue: "bottom", currentIsAppend: false,
    });
    assert.equal(up.kind, "region");
    if (up.kind === "region") assert.equal(up.region.value, "top");
  });

  it("exposes the final insertion slot through the terminal card with hysteresis", () => {
    const beforeTerminal = resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: 188, y: 50, currentRegionValue: "a", currentIsAppend: false,
    });
    assert.equal(beforeTerminal.kind, "region");
    if (beforeTerminal.kind === "region") assert.equal(beforeTerminal.region.value, "c");

    assert.deepEqual(resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: 188, y: 80, currentRegionValue: "c", currentIsAppend: false,
    }), { kind: "append" });
    assert.deepEqual(resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: 188, y: 52, currentRegionValue: null, currentIsAppend: true,
    }), { kind: "hold" });

    const returnToTerminal = resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: 188, y: 25, currentRegionValue: null, currentIsAppend: true,
    });
    assert.equal(returnToTerminal.kind, "region");
    if (returnToTerminal.kind === "region") assert.equal(returnToTerminal.region.value, "c");
  });

  it("stabilizes section and append boundaries while preserving intentional leave, append, and return transitions", () => {
    assert.deepEqual(resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: -2, y: 50, currentRegionValue: "a", currentIsAppend: false,
    }), { kind: "hold" });
    assert.deepEqual(resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: -30, y: 50, currentRegionValue: "a", currentIsAppend: false,
    }), { kind: "outside" });
    assert.deepEqual(resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: 60, y: 102, currentRegionValue: "a", currentIsAppend: false,
    }), { kind: "hold" });
    assert.deepEqual(resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: 60, y: 130, currentRegionValue: "a", currentIsAppend: false,
    }), { kind: "append" });
    assert.deepEqual(resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: 60, y: 98, currentRegionValue: null, currentIsAppend: true,
    }), { kind: "hold" });
    const reacquired = resolveImageSectionDragHit({
      geometry: horizontalGeometry, x: 60, y: 50, currentRegionValue: null, currentIsAppend: true,
    });
    assert.equal(reacquired.kind, "region");
    if (reacquired.kind === "region") assert.equal(reacquired.region.value, "a");
  });
});
