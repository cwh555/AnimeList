import assert from "node:assert/strict";
import { test } from "node:test";
import { imageLightboxZoomFromWheel } from "../src/ui/image-lightbox";

test("image lightbox wheel zoom is smooth and clamped", () => {
  assert.ok(imageLightboxZoomFromWheel(1, -100) > 1);
  assert.equal(imageLightboxZoomFromWheel(5, -1000), 5);
  assert.equal(imageLightboxZoomFromWheel(1, 1000), 1);
});
