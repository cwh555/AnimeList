import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ImageSectionService } from "../src/data/image-section-service";
import { copyPngBlobToClipboard } from "../src/ui/image-clipboard";
import {
  MOMENT_STACK_COPY_MAX_HEIGHT,
  MOMENT_STACK_COPY_MAX_PIXELS,
  MOMENT_STACK_COPY_MAX_WIDTH,
  planMomentStackRaster,
  rasterizeMomentStackToPng,
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

interface DiskSnapshot {
  files: Array<{ path: string; size: number }>;
  bytes: number;
}

async function diskSnapshot(root: string): Promise<DiskSnapshot> {
  const files: Array<{ path: string; size: number }> = [];
  let bytes = 0;
  const walk = async (directory: string, relative = ""): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const nextRelative = path.join(relative, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, nextRelative);
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(absolute);
      files.push({ path: nextRelative, size: info.size });
      bytes += info.size;
    }
  };
  await walk(root);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return { files, bytes };
}

function arrayBufferOf(buffer: Uint8Array): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

test("500 stacked copies keep vault disk usage flat and release decoded bitmaps", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "animelist-stack-copy-"));
  const imagePaths = ["a.png", "b.png", "c.png"];
  const sourceBytes = 16 * 1024;
  await Promise.all(imagePaths.map(async (name, index) => {
    const bytes = new Uint8Array(sourceBytes);
    bytes.fill(65 + index);
    await writeFile(path.join(vault, name), bytes);
  }));
  const before = await diskSnapshot(vault);

  let readCount = 0;
  let storeCalls = 0;
  const service = {
    readAsset: async (imagePath: string) => {
      readCount += 1;
      const bytes = await readFile(path.join(vault, imagePath));
      return { name: imagePath, data: arrayBufferOf(bytes), contentType: "image/png" };
    },
    storeAssets: async () => {
      storeCalls += 1;
      await writeFile(path.join(vault, `unexpected-composite-${storeCalls}.png`), new Uint8Array(4096));
      throw new Error("stack copy must never persist a composite");
    },
  } as unknown as ImageSectionService;

  const originalCreateEl = (globalThis as typeof globalThis & { createEl?: unknown }).createEl;
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalClipboardItem = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem");

  let activeBitmaps = 0;
  let maxActiveBitmaps = 0;
  let closedBitmaps = 0;
  let clipboardWrites = 0;

  (globalThis as typeof globalThis & { createEl: (tag: string) => HTMLCanvasElement }).createEl = (tag: string) => {
    assert.equal(tag, "canvas");
    const context = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      clearRect: () => undefined,
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D;
    return {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (callback: BlobCallback, contentType?: string) => {
        callback(new Blob([new Uint8Array(4096)], { type: contentType || "image/png" }));
      },
    } as unknown as HTMLCanvasElement;
  };

  globalThis.createImageBitmap = async (blob: Blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const marker = bytes[0];
    const dimensions = marker === 67 ? { width: 540, height: 760 } : { width: 960, height: 540 };
    activeBitmaps += 1;
    maxActiveBitmaps = Math.max(maxActiveBitmaps, activeBitmaps);
    let closed = false;
    return {
      ...dimensions,
      close: () => {
        if (closed) return;
        closed = true;
        activeBitmaps -= 1;
        closedBitmaps += 1;
      },
    } as ImageBitmap;
  };

  class StressClipboardItem {
    constructor(readonly items: Record<string, Blob>) {}
  }
  Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: StressClipboardItem });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        write: async (items: StressClipboardItem[]) => {
          clipboardWrites += 1;
          assert.equal(items.length, 1);
          assert.equal(items[0].items["image/png"]?.type, "image/png");
          // Deliberately do not retain the Blob: the plugin must not own a persistent copy cache.
        },
      },
    },
  });

  const copies = 500;
  try {
    for (let index = 0; index < copies; index += 1) {
      const png = await rasterizeMomentStackToPng(
        service,
        "Anime/Demo.md",
        imagePaths,
        [0, 56, 64],
        { displayWidth: 760, pixelRatio: 2 },
      );
      await copyPngBlobToClipboard(png);
      assert.equal(activeBitmaps, 0, `copy ${index + 1} leaked a decoded bitmap`);
    }
  } finally {
    if (originalCreateEl === undefined) delete (globalThis as typeof globalThis & { createEl?: unknown }).createEl;
    else (globalThis as typeof globalThis & { createEl?: unknown }).createEl = originalCreateEl;
    globalThis.createImageBitmap = originalCreateImageBitmap;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete (globalThis as typeof globalThis & { navigator?: Navigator }).navigator;
    if (originalClipboardItem) Object.defineProperty(globalThis, "ClipboardItem", originalClipboardItem);
    else delete (globalThis as typeof globalThis & { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  }

  const after = await diskSnapshot(vault);
  try {
    assert.deepEqual(after.files, before.files, "stack copy changed the vault file set or file sizes");
    assert.equal(after.bytes, before.bytes, "stack copy increased vault disk usage");
    assert.equal(storeCalls, 0, "stack copy called persistent image storage");
    assert.equal(readCount, copies * imagePaths.length, "each copy should only re-read the original assets");
    assert.equal(clipboardWrites, copies);
    assert.equal(activeBitmaps, 0);
    assert.ok(maxActiveBitmaps <= 1, `expected at most one decoded bitmap at once, saw ${maxActiveBitmaps}`);
    assert.equal(closedBitmaps, copies * 4, "every probe/layer bitmap should be closed after use");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
