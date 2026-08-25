import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile } from "obsidian";
import { ImageSectionService } from "../../src/data/image-section-service";
import { findImageSectionBlocks } from "../../src/domain/image-section";
import { createDefaultSettings } from "../../src/app/settings-model";

function file(path: string): TFile {
  const value = new TFile();
  value.path = path;
  value.name = path.split("/").pop() ?? path;
  value.basename = value.name.replace(/\.[^.]+$/, "");
  value.extension = value.name.split(".").pop() ?? "";
  value.stat = { ctime: 1, mtime: 1, size: 0 };
  return value;
}

function harness(markdown: string) {
  const note = file("AnimeList/Anime/Demo.md");
  const files = new Map<string, TFile>([[note.path, note]]);
  const data = new Map<string, string>([[note.path, markdown]]);
  const trashed: string[] = [];
  const binaries = new Map<string, ArrayBuffer>();
  const thumbnailRequests: string[] = [];
  let frontmatter: Record<string, unknown> = {
    title: "Demo", media_type: "anime", source_provider: "bangumi", source_id: "42",
  };
  const app: any = {
    metadataCache: {
      getFileCache(target: TFile) { return target.path === note.path ? { frontmatter } : {}; },
      getFirstLinkpathDest(path: string) { return files.get(path) ?? null; },
    },
    vault: {
      getAbstractFileByPath(path: string) { return files.get(path) ?? null; },
      getResourcePath(target: TFile) { return `app://${target.path}`; },
      async createBinary(path: string, bytes: ArrayBuffer) {
        const created = file(path);
        created.stat = { ctime: 1, mtime: Date.now(), size: bytes.byteLength };
        files.set(path, created);
        binaries.set(path, bytes.slice(0));
        return created;
      },
      async readBinary(target: TFile) {
        return binaries.get(target.path)?.slice(0) ?? new ArrayBuffer(target.stat.size);
      },
      async process(target: TFile, fn: (value: string) => string) {
        const next = fn(data.get(target.path) ?? "");
        data.set(target.path, next);
        return next;
      },
    },
    fileManager: {
      async trashFile(target: TFile) { trashed.push(target.path); files.delete(target.path); },
      async processFrontMatter(_target: TFile, fn: (fm: Record<string, unknown>) => void) {
        const next = { ...frontmatter }; fn(next); frontmatter = next;
      },
    },
  };
  const settings = createDefaultSettings();
  const service = new ImageSectionService({
    app, settings,
    async ensureFolder() {},
    async uniqueFilePath(folder, base, ext) { return `${folder}/${base}.${ext}`; },
    getImageThumbnailSources(target: TFile) { thumbnailRequests.push(target.path); return undefined; },
    refreshViews() {},
  });
  return { service, note, files, data, binaries, thumbnailRequests, trashed, getFrontmatter: () => frontmatter };
}

describe("image section storage service", () => {
  it("adds files to only the targeted block and preserves unrelated Markdown", async () => {
    const h = harness([
      "---", "title: Demo", "custom: preserve", "---", "# Demo",
      "## One", "```animelist-images", "- AnimeList/Images/shared.jpg", "```",
      "Keep this paragraph.",
      "## Two", "```animelist-images", "```", "",
    ].join("\n"));
    const second = findImageSectionBlocks(h.data.get(h.note.path) ?? "")[1];
    const result = await h.service.addAssets(h.note.path, second, [
      { name: "scene wide.PNG", data: new Uint8Array([1, 2, 3]).buffer, contentType: "image/png" },
    ]);
    assert.equal(result.added, 1);
    assert.equal(result.duplicatesSkipped, 0);
    assert.match(result.source, /AnimeList\/Images\/anime\/demo-bangumi-42\/scene wide\.png/);
    assert.deepEqual(h.thumbnailRequests, ["AnimeList/Images/anime/demo-bangumi-42/scene wide.png"]);
    const updated = h.data.get(h.note.path) ?? "";
    assert.match(updated, /custom: preserve/);
    assert.match(updated, /Keep this paragraph\./);
    assert.match(updated, /## One\n```animelist-images\n- AnimeList\/Images\/shared\.jpg\n```/);
  });

  it("skips exact duplicate image content in the same section even when the filename changes", async () => {
    const existingPath = "AnimeList/Images/anime/demo-bangumi-42/original.jpg";
    const h = harness(["# Demo", "```animelist-images", `- ${existingPath}`, "```", ""].join("\n"));
    const existing = file(existingPath);
    const existingBytes = new Uint8Array([1, 2, 3, 4]).buffer;
    existing.stat = { ctime: 1, mtime: 9, size: existingBytes.byteLength };
    h.files.set(existingPath, existing);
    h.binaries.set(existingPath, existingBytes);
    const block = findImageSectionBlocks(h.data.get(h.note.path) ?? "")[0];

    const result = await h.service.addAssets(h.note.path, block, [
      { name: "renamed-copy.png", data: new Uint8Array([1, 2, 3, 4]).buffer, contentType: "image/png" },
      { name: "unique.png", data: new Uint8Array([9, 8, 7]).buffer, contentType: "image/png" },
      { name: "same-unique-again.png", data: new Uint8Array([9, 8, 7]).buffer, contentType: "image/png" },
    ]);

    assert.equal(result.added, 1);
    assert.equal(result.duplicatesSkipped, 2);
    assert.match(result.source, /original\.jpg/);
    assert.match(result.source, /unique\.png/);
    assert.doesNotMatch(result.source, /renamed-copy/);
    assert.doesNotMatch(result.source, /same-unique-again/);
    assert.deepEqual(h.thumbnailRequests, [existingPath, "AnimeList/Images/anime/demo-bangumi-42/unique.png"]);
  });

  it("skips a re-encoded copy when canonical decoded pixels match even if binary bytes differ", async () => {
    const previousBitmap = globalThis.createImageBitmap;
    const previousCreateEl = globalThis.createEl;
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: async () => ({ width: 320, height: 180, close() {} }),
    });
    Object.defineProperty(globalThis, "createEl", {
      configurable: true,
      value: (tag: string) => {
        assert.equal(tag, "canvas");
        return {
          width: 0, height: 0,
          getContext: () => ({
            imageSmoothingEnabled: false, imageSmoothingQuality: "low",
            drawImage() {},
            getImageData: () => ({ data: new Uint8ClampedArray(64 * 64 * 4).fill(17) }),
          }),
        };
      },
    });

    try {
      const existingPath = "AnimeList/Images/anime/demo-bangumi-42/original.jpg";
      const h = harness(["# Demo", "```animelist-images", `- ${existingPath}`, "```", ""].join("\n"));
      const existing = file(existingPath);
      const jpegBytes = new Uint8Array([1, 2, 3, 4]).buffer;
      existing.stat = { ctime: 1, mtime: 9, size: jpegBytes.byteLength };
      h.files.set(existingPath, existing);
      h.binaries.set(existingPath, jpegBytes);
      const block = findImageSectionBlocks(h.data.get(h.note.path) ?? "")[0];

      const result = await h.service.addAssets(h.note.path, block, [
        { name: "clipboard-copy.png", data: new Uint8Array([9, 9, 9, 9, 9]).buffer, contentType: "image/png" },
      ]);
      assert.equal(result.added, 0);
      assert.equal(result.duplicatesSkipped, 1);
      assert.equal(h.files.has("AnimeList/Images/anime/demo-bangumi-42/clipboard-copy.png"), false);
    } finally {
      Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: previousBitmap });
      Object.defineProperty(globalThis, "createEl", { configurable: true, value: previousCreateEl });
    }
  });

  it("does not trash a managed file while another image section still references it", async () => {
    const path = "AnimeList/Images/anime/demo-bangumi-42/shared.jpg";
    const h = harness([
      "# Demo", "## One", "```animelist-images", `- ${path}`, "```",
      "## Two", "```animelist-images", `- ${path}`, "```", "",
    ].join("\n"));
    h.files.set(path, file(path));
    const first = findImageSectionBlocks(h.data.get(h.note.path) ?? "")[0];
    await h.service.remove(h.note.path, first, path);
    assert.deepEqual(h.trashed, []);
    assert.match(h.data.get(h.note.path) ?? "", new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });


  it("does not trash a managed file while a moments section still references it", async () => {
    const path = "AnimeList/Images/anime/demo-bangumi-42/shared.jpg";
    const h = harness([
      "# Demo",
      "## Images", "```animelist-images", `- ${path}`, "```",
      "## Moments", "```animelist-moments", "moments:",
      '  - id: "m_shared123"', "    text: |-", "      same image", "    images:", `      - "${path}"`, "```", "",
    ].join("\n"));
    h.files.set(path, file(path));
    const block = findImageSectionBlocks(h.data.get(h.note.path) ?? "")[0];
    await h.service.remove(h.note.path, block, path);
    assert.deepEqual(h.trashed, []);
    assert.match(h.data.get(h.note.path) ?? "", /m_shared123/);
  });

  it("batch-removes selected images and moves only safe managed files through Obsidian trash", async () => {
    const firstPath = "AnimeList/Images/anime/demo-bangumi-42/first.jpg";
    const secondPath = "AnimeList/Images/anime/demo-bangumi-42/second.jpg";
    const coverPath = "AnimeList/Images/anime/demo-bangumi-42/cover.jpg";
    const sharedPath = "AnimeList/Images/anime/demo-bangumi-42/shared.jpg";
    const h = harness([
      "# Demo",
      "## One", "```animelist-images",
      `- ${firstPath}`, `- ${secondPath}`, `- ${coverPath}`, `- ${sharedPath}`, "```",
      "## Two", "```animelist-images", `- ${sharedPath}`, "```", "",
    ].join("\n"));
    for (const path of [firstPath, secondPath, coverPath, sharedPath]) h.files.set(path, file(path));
    await h.service.setAsCover(h.note.path, coverPath);
    const block = findImageSectionBlocks(h.data.get(h.note.path) ?? "")[0];
    await h.service.removeMany(h.note.path, block, [firstPath, secondPath, coverPath, sharedPath]);

    assert.deepEqual(h.trashed.sort(), [firstPath, secondPath].sort());
    const updated = h.data.get(h.note.path) ?? "";
    assert.doesNotMatch(updated, new RegExp(firstPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(updated, new RegExp(secondPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(updated, new RegExp(sharedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(h.getFrontmatter().cover, coverPath);
    assert.equal(h.files.has(coverPath), true);
    assert.equal(h.files.has(sharedPath), true);
  });

  it("sets a gallery image as cover and protects that file from deletion", async () => {
    const path = "AnimeList/Images/anime/demo-bangumi-42/cover.jpg";
    const h = harness(["# Demo", "```animelist-images", `- ${path}`, "```", ""].join("\n"));
    h.files.set(path, file(path));
    await h.service.setAsCover(h.note.path, path);
    assert.equal(h.getFrontmatter().cover, path);
    const block = findImageSectionBlocks(h.data.get(h.note.path) ?? "")[0];
    await h.service.remove(h.note.path, block, path);
    assert.deepEqual(h.trashed, []);
  });
  it("persists per-section column metadata without changing image order or unrelated Markdown", async () => {
    const h = harness([
      "# Demo",
      "## One", "```animelist-images custom=keep", "- a.jpg", "- b.jpg", "```",
      "Keep this paragraph.",
      "## Two", "```animelist-images", "- c.jpg", "```", "",
    ].join("\n"));
    const first = findImageSectionBlocks(h.data.get(h.note.path) ?? "")[0];
    const update = await h.service.setColumns(h.note.path, first, 6);
    assert.equal(update.source, "- a.jpg\n- b.jpg");
    assert.match(h.data.get(h.note.path) ?? "", /```animelist-images custom=keep columns=6\n- a\.jpg\n- b\.jpg/);
    assert.match(h.data.get(h.note.path) ?? "", /Keep this paragraph\./);
    assert.match(h.data.get(h.note.path) ?? "", /## Two\n```animelist-images\n- c\.jpg/);
  });

  it("persists coalesced absolute section orders in one note update", async () => {
    const h = harness([
      "# Demo",
      "## One", "```animelist-images columns=2", "- a.jpg", "- b.jpg", "```",
      "Keep this paragraph.",
      "## Two", "```animelist-images columns=5", "- c.jpg", "- d.jpg", "```", "",
    ].join("\n"));
    const [first, second] = findImageSectionBlocks(h.data.get(h.note.path) ?? "");
    const states = await h.service.setSectionOrders(h.note.path, [
      { locator: first, expectedPaths: ["a.jpg", "b.jpg"], paths: ["b.jpg", "a.jpg"] },
      { locator: second, expectedPaths: ["c.jpg", "d.jpg"], paths: ["d.jpg", "c.jpg"] },
    ]);
    const updated = h.data.get(h.note.path) ?? "";
    assert.deepEqual(states.map((state) => state.source), ["- b.jpg\n- a.jpg", "- d.jpg\n- c.jpg"]);
    assert.match(updated, /```animelist-images columns=2\n- b\.jpg\n- a\.jpg/);
    assert.match(updated, /```animelist-images columns=5\n- d\.jpg\n- c\.jpg/);
    assert.match(updated, /Keep this paragraph\./);
  });

  it("persists a same-section reorder without trashing or rewriting other content", async () => {
    const h = harness([
      "# Demo", "```animelist-images columns=3",
      "- a.jpg", "- b.jpg", "- c.jpg", "```",
      "Keep this paragraph.", "",
    ].join("\n"));
    const block = findImageSectionBlocks(h.data.get(h.note.path) ?? "")[0];
    const [state] = await h.service.setSectionOrders(h.note.path, [{
      locator: block,
      expectedPaths: ["a.jpg", "b.jpg", "c.jpg"],
      paths: ["c.jpg", "a.jpg", "b.jpg"],
    }]);
    assert.equal(state.source, "- c.jpg\n- a.jpg\n- b.jpg");
    assert.match(h.data.get(h.note.path) ?? "", /```animelist-images columns=3\n- c\.jpg\n- a\.jpg\n- b\.jpg\n```/);
    assert.match(h.data.get(h.note.path) ?? "", /Keep this paragraph\./);
    assert.deepEqual(h.trashed, []);
  });

  it("persists cross-section orders in one atomic note update without trashing the asset", async () => {
    const path = "AnimeList/Images/anime/demo-bangumi-42/move.jpg";
    const h = harness([
      "# Demo",
      "## One", "```animelist-images columns=2", `- ${path}`, "- stay.jpg", "```",
      "Keep this paragraph.",
      "## Two", "```animelist-images columns=5", "- target-a.jpg", "- target-b.jpg", "```", "",
    ].join("\n"));
    h.files.set(path, file(path));
    const [source, target] = findImageSectionBlocks(h.data.get(h.note.path) ?? "");
    const states = await h.service.setSectionOrders(h.note.path, [
      { locator: source, expectedPaths: [path, "stay.jpg"], paths: ["stay.jpg"] },
      { locator: target, expectedPaths: ["target-a.jpg", "target-b.jpg"], paths: ["target-a.jpg", path, "target-b.jpg"] },
    ]);
    const updated = h.data.get(h.note.path) ?? "";
    assert.match(updated, /```animelist-images columns=2\n- stay\.jpg\n```/);
    assert.ok(updated.includes([
      "```animelist-images columns=5",
      "- target-a.jpg",
      `- ${path}`,
      "- target-b.jpg",
      "```",
    ].join("\n")));
    assert.match(updated, /Keep this paragraph\./);
    assert.equal(states[0].source, "- stay.jpg");
    assert.match(states[1].source, /move\.jpg/);
    assert.deepEqual(h.trashed, []);
    assert.equal(h.files.has(path), true);
  });

});
