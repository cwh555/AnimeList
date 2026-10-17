import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OBSIDIAN_IGNORE_SWIPE_ATTRIBUTE,
  appendObsidianNativeSwipeEdges,
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

  it("creates unmarked native edge targets beside the interaction surface", () => {
    const children: Array<{ className: string; attributes: Map<string, string> }> = [];
    const container = {
      ownerDocument: {
        createElement(tag: string) {
          assert.equal(tag, "div");
          const attributes = new Map<string, string>();
          return {
            className: "",
            attributes,
            setAttribute(name: string, value: string) { attributes.set(name, value); },
          };
        },
      },
      appendChild(child: { className: string; attributes: Map<string, string> }) {
        children.push(child);
      },
    } as unknown as HTMLElement;
    appendObsidianNativeSwipeEdges(container);
    assert.deepEqual(children.map((child) => child.className), [
      "al-native-swipe-edge is-left",
      "al-native-swipe-edge is-right",
    ]);
    assert.ok(children.every((child) => child.attributes.get("aria-hidden") === "true"));
    assert.ok(children.every((child) => !child.attributes.has(OBSIDIAN_IGNORE_SWIPE_ATTRIBUTE)));
  });
});
