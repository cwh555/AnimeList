import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIBRARY_CARD_BATCH_SIZE, ProgressiveRenderWindow } from "../src/ui/library-progressive-render";

describe("library progressive render window", () => {
  it("reveals a bounded first batch and advances without duplicates", () => {
    const window = new ProgressiveRenderWindow(70);
    assert.deepEqual(window.reset(), { start: 0, end: LIBRARY_CARD_BATCH_SIZE, done: false });
    assert.deepEqual(window.next(), { start: 24, end: 48, done: false });
    assert.deepEqual(window.next(), { start: 48, end: 70, done: true });
  });

  it("clamps short result sets and resets for a new filter result", () => {
    const window = new ProgressiveRenderWindow(8);
    assert.deepEqual(window.reset(), { start: 0, end: 8, done: true });
    assert.deepEqual(window.reset(30), { start: 0, end: 24, done: false });
    assert.deepEqual(window.next(), { start: 24, end: 30, done: true });
  });
});
