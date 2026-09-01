import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OBSIDIAN_IGNORE_SWIPE_ATTRIBUTE,
  isolateHorizontalSwipeSurface,
} from "../src/ui/mobile-swipe-isolation";

function fakeElement(): {
  element: HTMLElement;
  attributes: Map<string, string>;
} {
  const attributes = new Map<string, string>();
  const element = {
    setAttribute(name: string, value: string) { attributes.set(name, value); },
  } as unknown as HTMLElement;
  return { element, attributes };
}

describe("mobile horizontal swipe ownership", () => {
  it("marks only the supplied interaction surface for Obsidian swipe isolation", () => {
    const target = fakeElement();
    const sibling = fakeElement();

    assert.equal(isolateHorizontalSwipeSurface(target.element), target.element);
    assert.equal(target.attributes.get(OBSIDIAN_IGNORE_SWIPE_ATTRIBUTE), "true");
    assert.equal(sibling.attributes.has(OBSIDIAN_IGNORE_SWIPE_ATTRIBUTE), false);
  });
});
