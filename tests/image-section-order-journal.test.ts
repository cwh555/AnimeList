import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataAdapter } from "obsidian";
import {
  ImageSectionOrderJournal,
  imageSectionOrderJournalKey,
} from "../src/data/image-section-order-journal";

function adapterHarness(): { adapter: DataAdapter; files: Map<string, ArrayBuffer>; directories: Set<string> } {
  const files = new Map<string, ArrayBuffer>();
  const directories = new Set<string>();
  const adapter: DataAdapter = {
    async exists(path) { return files.has(path) || directories.has(path); },
    async mkdir(path) { directories.add(path); },
    async list(path) {
      const prefix = `${path.replace(/\/+$/u, "")}/`;
      return {
        files: [...files.keys()].filter((entry) => entry.startsWith(prefix)),
        folders: [...directories].filter((entry) => entry.startsWith(prefix)),
      };
    },
    async stat(path) {
      if (files.has(path)) return { type: "file", ctime: 1, mtime: 1, size: files.get(path)?.byteLength ?? 0 };
      if (directories.has(path)) return { type: "folder", ctime: 1, mtime: 1, size: 0 };
      return null;
    },
    async readBinary(path) { return files.get(path)?.slice(0) ?? new ArrayBuffer(0); },
    async writeBinary(path, data) { files.set(path, data.slice(0)); },
    async rename(path, newPath) {
      const value = files.get(path);
      if (value) { files.delete(path); files.set(newPath, value); return; }
      if (directories.delete(path)) directories.add(newPath);
    },
    async remove() { throw new Error("permanent remove must not be used"); },
    getResourcePath(path) { return path; },
  };
  return { adapter, files, directories };
}

describe("image section order journal", () => {
  it("stores one deterministic sidecar per note and reloads the latest snapshot", async () => {
    const harness = adapterHarness();
    const journal = new ImageSectionOrderJournal(
      harness.adapter,
      ".obsidian/plugins/animelist/state/image-order",
    );
    const sourcePath = "AnimeList/Anime/Demo.md";
    const path = journal.pathFor(sourcePath);
    assert.equal(path.endsWith(`${imageSectionOrderJournalKey(sourcePath)}.json`), true);

    await journal.write({
      version: 1,
      sourcePath,
      updatedAt: 10,
      sections: [{ id: "0:1", lineStart: 8, expectedPaths: ["a.jpg", "b.jpg"], paths: ["b.jpg", "a.jpg"] }],
    });
    const sizeAfterFirstWrite = harness.files.size;
    await journal.write({
      version: 1,
      sourcePath,
      updatedAt: 20,
      sections: [{ id: "0:1", lineStart: 8, expectedPaths: ["a.jpg", "b.jpg"], paths: ["b.jpg", "c.jpg", "a.jpg"] }],
    });

    assert.equal(harness.files.size, sizeAfterFirstWrite);
    assert.equal(harness.files.size, 1);
    const reloaded = await journal.loadAll();
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0]?.updatedAt, 20);
    assert.deepEqual(reloaded[0]?.sections[0]?.paths, ["b.jpg", "c.jpg", "a.jpg"]);

    await journal.remove(sourcePath);
    assert.equal(harness.files.has(path), false);
    assert.equal([...harness.files.keys()].some((entry) => entry.startsWith(".trash/AnimeList/Internal/image-order/")), true);
  });
});
