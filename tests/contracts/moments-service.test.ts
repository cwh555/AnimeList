import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile } from "obsidian";
import { ImageSectionService } from "../../src/data/image-section-service";
import { MomentsService } from "../../src/data/moments-service";
import { findMomentsBlocks, parseMomentsSource } from "../../src/domain/moments";
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
  const binaries = new Map<string, ArrayBuffer>();
  const trashed: string[] = [];
  let frontmatter: Record<string, unknown> = {
    title: "Demo", media_type: "anime", source_provider: "bangumi", source_id: "42",
  };
  let unique = 0;
  const app: any = {
    metadataCache: {
      getFileCache(target: TFile) { return target.path === note.path ? { frontmatter } : {}; },
      getFirstLinkpathDest(path: string) { return files.get(path) ?? null; },
    },
    vault: {
      getAbstractFileByPath(path: string) { return files.get(path) ?? null; },
      getResourcePath(target: TFile) { return `app://${target.path}`; },
      async read(target: TFile) { return data.get(target.path) ?? ""; },
      async readBinary(target: TFile) { return binaries.get(target.path)?.slice(0) ?? new ArrayBuffer(target.stat.size); },
      async createBinary(path: string, bytes: ArrayBuffer) {
        const created = file(path);
        created.stat = { ctime: 1, mtime: Date.now(), size: bytes.byteLength };
        files.set(path, created);
        binaries.set(path, bytes.slice(0));
        return created;
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
  const imageService = new ImageSectionService({
    app,
    settings: createDefaultSettings(),
    async ensureFolder() {},
    async uniqueFilePath(folder, base, ext) { unique += 1; return `${folder}/${base}-${unique}.${ext}`; },
    getImageThumbnailSources() { return undefined; },
    refreshViews() {},
  });
  const service = new MomentsService({ app } as any, imageService);
  return { note, files, data, binaries, trashed, service, imageService };
}

describe("moments storage service", () => {
  it("adds and edits one moment while keeping its stable unique id", async () => {
    const h = harness(["# Demo", "```animelist-moments", "moments: []", "```", "Keep this paragraph."].join("\n"));
    const block = findMomentsBlocks(h.data.get(h.note.path) ?? "")[0];
    const added = await h.service.addMoment(h.note.path, block, {
      text: "第一句\n第二句",
      source: "第 1 話",
      position: "旅途的記憶",
      speaker: "芙莉蓮",
      tags: ["回憶片段", "名台詞"],
      note: "這是一個帶 metadata 的 Moments 測試。",
      retainedImages: [],
      newAssets: [
        { name: "one.png", contentType: "image/png", data: new Uint8Array([1, 2, 3]).buffer },
        { name: "two.png", contentType: "image/png", data: new Uint8Array([4, 5, 6]).buffer },
      ],
    });
    assert.ok(added.moment?.id.startsWith("m_"));
    assert.equal(added.moment?.images.length, 2);
    assert.equal(added.moment?.source, "第 1 話");
    assert.deepEqual(added.moment?.tags, ["回憶片段", "名台詞"]);
    assert.match(h.data.get(h.note.path) ?? "", /Keep this paragraph\./);

    const nextBlock = findMomentsBlocks(h.data.get(h.note.path) ?? "")[0];
    const id = added.moment?.id ?? "";
    const edited = await h.service.editMoment(h.note.path, nextBlock, id, {
      text: "更新後的文字",
      source: "第 2 話",
      position: "23:59",
      speaker: "費倫",
      tags: ["重編輯"],
      note: "metadata 可編輯且要保留 stable id。",
      retainedImages: [added.moment?.images[0] ?? ""],
      newAssets: [{ name: "three.png", contentType: "image/png", data: new Uint8Array([7, 8, 9]).buffer }],
    });
    assert.equal(edited.moment?.id, id);
    assert.equal(edited.moment?.text, "更新後的文字");
    assert.equal(edited.moment?.position, "23:59");
    assert.deepEqual(edited.moment?.tags, ["重編輯"]);
    assert.equal(edited.moment?.images.length, 2);
    assert.equal(h.trashed.length, 1);
    assert.equal(parseMomentsSource(edited.source)[0].id, id);
  });

  it("persists stacked whole-image gaps and keeps them aligned when a queued duplicate is skipped", async () => {
    const h = harness(["# Demo", "```animelist-moments", "moments: []", "```"].join("\n"));
    const block = findMomentsBlocks(h.data.get(h.note.path) ?? "")[0];
    const duplicate = new Uint8Array([1, 2, 3, 4]).buffer;
    const added = await h.service.addMoment(h.note.path, block, {
      text: "疊圖字幕測試",
      imageLayout: "stacked",
      stackGapsY: [0, 65, 58],
      retainedImages: [],
      newAssets: [
        { name: "first.png", contentType: "image/png", data: duplicate },
        { name: "duplicate.png", contentType: "image/png", data: duplicate.slice(0) },
        { name: "third.png", contentType: "image/png", data: new Uint8Array([9, 8, 7, 6]).buffer },
      ],
    });
    assert.equal(added.duplicatesSkipped, 1);
    assert.equal(added.moment?.imageLayout, "stacked");
    assert.deepEqual(added.moment?.stackGapsY, [0, 58]);
    assert.equal(added.moment?.images.length, 2);
    const persisted = parseMomentsSource(findMomentsBlocks(h.data.get(h.note.path) ?? "")[0].source)[0];
    assert.equal(persisted.imageLayout, "stacked");
    assert.deepEqual(persisted.stackGapsY, [0, 58]);
  });

  it("deletes a moment but keeps an image file when another moments block still references it", async () => {
    const shared = "AnimeList/Images/anime/demo-bangumi-42/shared.jpg";
    const source = [
      "# Demo",
      "## One", "```animelist-moments", "moments:", '  - id: "m_first123"', "    text: |-", "      first", "    images:", `      - "${shared}"`, "```",
      "## Two", "```animelist-moments", "moments:", '  - id: "m_second123"', "    text: |-", "      second", "    images:", `      - "${shared}"`, "```",
    ].join("\n");
    const h = harness(source);
    h.files.set(shared, file(shared));
    h.binaries.set(shared, new Uint8Array([1]).buffer);
    const first = findMomentsBlocks(source)[0];
    await h.service.deleteMoment(h.note.path, first, "m_first123");
    assert.deepEqual(h.trashed, []);
    assert.match(h.data.get(h.note.path) ?? "", /m_second123/);
  });

  it("prevents edits when manually duplicated moment ids make the target ambiguous", async () => {
    const source = [
      "```animelist-moments", "moments:",
      '  - id: "m_same123"', "    text: |-", "      one", "    images:", '      - "a.jpg"',
      '  - id: "m_same123"', "    text: |-", "      two", "    images:", '      - "b.jpg"',
      "```",
    ].join("\n");
    const h = harness(source);
    const block = findMomentsBlocks(source)[0];
    await assert.rejects(h.service.editMoment(h.note.path, block, "m_same123", {
      text: "changed", retainedImages: ["a.jpg"], newAssets: [],
    }), /missing or duplicate IDs/);
  });
  it("refuses to add while any moments section in the note has a duplicate stable id", async () => {
    const source = [
      "## One", "```animelist-moments", "moments:",
      '  - id: "m_cross123"', "    text: one", "    images:", '      - "a.jpg"', "```",
      "## Two", "```animelist-moments", "moments:",
      '  - id: "m_cross123"', "    text: two", "    images:", '      - "b.jpg"', "```",
      "## Three", "```animelist-moments", "moments: []", "```",
    ].join("\n");
    const h = harness(source);
    const target = findMomentsBlocks(source)[2];
    await assert.rejects(h.service.addMoment(h.note.path, target, {
      text: "new",
      retainedImages: [],
      newAssets: [{ name: "new.png", contentType: "image/png", data: new Uint8Array([1, 2]).buffer }],
    }), /duplicate Moment IDs/);
  });

});
