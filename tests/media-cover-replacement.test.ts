import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App, TFile } from "obsidian";
import { MediaCoverStorage, mediaCoverExtension } from "../src/data/media-cover-storage";
import { MediaUpdateService } from "../src/data/media-update-service";
import { createDefaultSettings } from "../src/app/settings-model";
import type { LibraryStorage } from "../src/data/library-storage";
import type { MediaNoteForm } from "../src/domain/media-types";

const image = (name = "portrait.png", contentType = "image/png") => ({
  name,
  contentType,
  data: new Uint8Array([1, 2, 3, 4]).buffer,
});

function form(): MediaNoteForm {
  return {
    title: "Example",
    status: "ongoing",
    releaseStatus: "unknown",
    progress: 2,
    total: 12,
    unit: "episode",
    score: null,
    favorite: false,
    startedAt: "",
    completedAt: "",
    genres: ["Romance"],
    templatePath: "",
    volumeLog: [],
  };
}

describe("local cover upload validation", () => {
  it("accepts supported image types and normalizes JPEG", () => {
    assert.equal(mediaCoverExtension(image("portrait.jpeg", "image/jpeg")), "jpg");
    assert.equal(mediaCoverExtension(image("portrait.png", "image/png")), "png");
    assert.equal(mediaCoverExtension(image("portrait.webp", "image/webp")), "webp");
    assert.equal(mediaCoverExtension(image("portrait.avif", "image/avif")), "avif");
    assert.equal(mediaCoverExtension(image("download", "image/png")), "png");
  });
  it("rejects empty, oversized, mismatched and unsupported images before writing", () => {
    assert.throws(() => mediaCoverExtension({ ...image(), data: new ArrayBuffer(0) }), /nonempty/);
    assert.throws(() => mediaCoverExtension({ ...image(), data: new ArrayBuffer(20 * 1024 * 1024 + 1) }), /20 MB/);
    assert.throws(() => mediaCoverExtension(image("image.jpg", "image/png")), /does not match/);
    assert.throws(() => mediaCoverExtension(image("image.svg", "image/svg+xml")), /JPEG|Unsupported/);
  });
});

describe("shared local cover storage", () => {
  it("stores a uniquely named original in the configured media-type folder, then optimizes the thumbnail", async () => {
    const events: string[] = [];
    const created = new TFile();
    created.path = "Vault/Covers/anime/Example-replacement.png";
    const sourceData = image();
    const app = {
      vault: {
        async createBinary(path: string, data: ArrayBuffer) {
          events.push("write:" + path);
          assert.equal(data, sourceData.data);
          return created;
        },
      },
    } as unknown as App;
    const settings = createDefaultSettings();
    settings.coverFolder = "Vault/Covers";
    const storage = {
      async ensureFolder(path: string) { events.push("folder:" + path); },
      async uniqueFilePath(folder: string, base: string, ext: string) {
        events.push(`unique:${folder}:${base}:${ext}`);
        return created.path;
      },
    } as unknown as LibraryStorage;
    const store = new MediaCoverStorage(app, () => settings, storage, {
      async optimizeFile(file) { events.push("optimize:" + file.path); },
    });
    const path = await store.store("anime", "Example", sourceData, "replacement");
    assert.equal(path, created.path);
    assert.deepEqual(events, [
      "folder:Vault/Covers/anime",
      "unique:Vault/Covers/anime:example-replacement:png",
      "write:Vault/Covers/anime/Example-replacement.png",
      "optimize:Vault/Covers/anime/Example-replacement.png",
    ]);
  });
  it("does not reject a valid original when optional thumbnail optimization fails", async () => {
    const created = new TFile();
    created.path = "Vault/Covers/anime/cover.png";
    const settings = createDefaultSettings();
    let createdCount = 0;
    const store = new MediaCoverStorage(
      { vault: { async createBinary() { createdCount++; return created; } } } as unknown as App,
      () => settings,
      { async ensureFolder() {}, async uniqueFilePath() { return created.path; } } as unknown as LibraryStorage,
      { async optimizeFile() { throw new Error("thumbnail unavailable"); } },
    );
    const oldWarn = console.warn;
    console.warn = () => undefined;
    try {
      assert.equal(await store.store("anime", "Example", image()), created.path);
      assert.equal(createdCount, 1);
    } finally {
      console.warn = oldWarn;
    }
  });
});

describe("replacing existing work cover", () => {
  it("updates only the cover and editable fields without deleting the previous cover, remote fallback or note body", async () => {
    const file = new TFile();
    file.path = "AnimeList/Anime/Example.md";
    const frontmatter: Record<string, unknown> = {
      title: "Example",
      media_type: "anime",
      cover: "AnimeList/Covers/anime/original.jpg",
      cover_remote: "https://example.invalid/old.jpg",
      source_provider: "bangumi",
      source_id: "52",
      custom: { preserve: true },
    };
    const events: string[] = [];
    const source = "# Example\n\nUnrelated content stays here.";
    let content = source;
    const app = {
      metadataCache: { getFileCache: () => ({ frontmatter }) },
      vault: {
        async modify() { content = "WRONG"; },
        getAbstractFileByPath: () => null,
      },
      fileManager: {
        async processFrontMatter(_file: TFile, writer: (fm: Record<string, unknown>) => void) {
          events.push("frontmatter");
          writer(frontmatter);
        },
        async renameFile() { throw new Error("should not rename this note"); },
      },
    } as unknown as App;
    const store = {
      async store(_type: string, _title: string, asset: { name: string }) {
        events.push("store:" + asset.name);
        return "AnimeList/Covers/anime/Example-replacement.png";
      },
      async discardUncommitted() { events.push("unexpected-discard"); },
    };
    let refreshes = 0;
    await new MediaUpdateService(app, { refreshViews() { refreshes++; } }, store)
      .update(file, "anime", form(), image());
    assert.deepEqual(events, ["store:portrait.png", "frontmatter"]);
    assert.equal(refreshes, 1);
    assert.equal(frontmatter.cover, "AnimeList/Covers/anime/Example-replacement.png");
    assert.equal(frontmatter.cover_remote, "https://example.invalid/old.jpg");
    assert.equal(frontmatter.source_provider, "bangumi");
    assert.equal(frontmatter.source_id, "52");
    assert.deepEqual(frontmatter.custom, { preserve: true });
    assert.equal(content, source);
  });

  it("keeps the existing cover unchanged when no replacement was selected", async () => {
    const file = new TFile();
    file.path = "AnimeList/Anime/Example.md";
    const fm: Record<string, unknown> = { title: "Example", cover: "old.jpg" };
    const app = {
      metadataCache: { getFileCache: () => ({ frontmatter: fm }) },
      fileManager: { async processFrontMatter(_f: TFile, apply: (fm: Record<string, unknown>) => void) { apply(fm); } },
    } as unknown as App;
    await new MediaUpdateService(app, { refreshViews() {} }).update(file, "anime", form(), null);
    assert.equal(fm.cover, "old.jpg");
  });

  it("does not create cover files for invalid edits or invalid image input", async () => {
    const file = new TFile();
    file.path = "AnimeList/Anime/Example.md";
    let writes = 0;
    const store = { async store() { writes++; return "new.png"; }, async discardUncommitted() {} };
    const app = {
      metadataCache: { getFileCache: () => ({ frontmatter: { title: "Example" } }) },
    } as unknown as App;
    const update = new MediaUpdateService(app, { refreshViews() {} }, store);
    await assert.rejects(() => update.update(file, "anime", { ...form(), title: "" }, image()), /作品名稱/);
    await assert.rejects(() => update.update(file, "anime", form(), image("bad.svg", "image/svg+xml")), /JPEG|Unsupported/);
    assert.equal(writes, 0);
  });

  it("discards only the newly created file after a failed note save, preserving old cover", async () => {
    const file = new TFile();
    file.path = "AnimeList/Anime/Example.md";
    const fm: Record<string, unknown> = { title: "Example", cover: "original.jpg" };
    const removed: string[] = [];
    let refreshes = 0;
    const app = {
      metadataCache: { getFileCache: () => ({ frontmatter: fm }) },
      fileManager: { async processFrontMatter() { throw new Error("frontmatter write failed"); } },
    } as unknown as App;
    const store = {
      async store() { return "new-upload.png"; },
      async discardUncommitted(path: string) { removed.push(path); },
    };
    await assert.rejects(
      () => new MediaUpdateService(app, { refreshViews() { refreshes++; } }, store).update(file, "anime", form(), image()),
      /frontmatter write failed/,
    );
    assert.deepEqual(removed, ["new-upload.png"]);
    assert.equal(fm.cover, "original.jpg");
    assert.equal(refreshes, 0);
  });
});
