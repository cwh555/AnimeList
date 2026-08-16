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

import { copyImagesToClipboard, imageAssetsFromClipboard } from "../src/ui/image-clipboard";

test("copy images writes every moment image as a clipboard item when the platform supports multi-item writes", async () => {
  const service = {
    async readAsset(path: string) {
      const byte = path.endsWith("one.png") ? 1 : 2;
      return { name: path, data: new Uint8Array([137, 80, 78, 71, byte]).buffer, contentType: "image/png" };
    },
  } as unknown as ImageSectionService;
  const writes: unknown[][] = [];
  class FakeClipboardItem { constructor(readonly items: Record<string, Blob>) {} }
  const previousClipboardItem = globalThis.ClipboardItem;
  const previousNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: FakeClipboardItem });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { write: async (items: unknown[]) => { writes.push(items); } } },
  });
  try {
    await copyImagesToClipboard(service, "note.md", ["one.png", "two.png"]);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].length, 2);
  } finally {
    Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: previousClipboardItem });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: previousNavigator });
  }
});

test("image clipboard parser restores multiple AnimeList HTML fallback images", async () => {
  const first = Buffer.from([1, 2, 3]).toString("base64");
  const second = Buffer.from([4, 5, 6]).toString("base64");
  const event = {
    clipboardData: {
      files: [],
      getData(type: string) {
        return type === "text/html"
          ? `<div data-animelist-images="true"><img src="data:image/png;base64,${first}"><img src="data:image/png;base64,${second}"></div>`
          : "";
      },
    },
  } as unknown as ClipboardEvent;
  const assets = await imageAssetsFromClipboard(event);
  assert.equal(assets.length, 2);
  assert.deepEqual([...new Uint8Array(assets[0].data)], [1, 2, 3]);
  assert.deepEqual([...new Uint8Array(assets[1].data)], [4, 5, 6]);
});
