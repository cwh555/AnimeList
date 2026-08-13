import assert from "node:assert/strict";
import test from "node:test";
import type { ImageSectionService } from "../src/data/image-section-service";
import { copyImageToClipboard } from "../src/ui/image-clipboard";

test("copy image writes PNG bytes to the system clipboard without changing the source asset", async () => {
  const sourceBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]).buffer;
  const service = {
    async readAsset() {
      return { name: "scene.png", data: sourceBytes, contentType: "image/png" };
    },
  } as unknown as ImageSectionService;

  const writes: unknown[][] = [];
  class FakeClipboardItem {
    constructor(readonly items: Record<string, Blob>) {}
  }
  const previousClipboardItem = globalThis.ClipboardItem;
  const previousNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: FakeClipboardItem });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { write: async (items: unknown[]) => { writes.push(items); } } },
  });

  try {
    await copyImageToClipboard(service, "AnimeList/Anime/Demo.md", "Images/scene.png");
    assert.equal(writes.length, 1);
    const item = writes[0][0] as FakeClipboardItem;
    assert.deepEqual(Object.keys(item.items), ["image/png"]);
    assert.deepEqual(
      [...new Uint8Array(await item.items["image/png"].arrayBuffer())],
      [...new Uint8Array(sourceBytes)],
    );
  } finally {
    Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: previousClipboardItem });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: previousNavigator });
  }
});
