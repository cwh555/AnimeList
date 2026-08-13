import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allImageSectionPaths,
  findImageSectionBlocks,
  imageContentHash,
  imageExtensionFor,
  imageSectionInsertionPlan,
  imageSectionFolderForNote,
  imageSectionRootFromCoverFolder,
  normalizeImageSectionPath,
  parseImageSectionSource,
  replaceImageSectionPaths,
  serializeImageSectionPaths,
} from "../src/domain/image-section";

describe("image section Markdown model", () => {
  it("normalizes plain list paths and wiki embeds without captions or hidden metadata", () => {
    assert.deepEqual(parseImageSectionSource([
      "- AnimeList/Images/demo/one.jpg",
      "![[AnimeList/Images/demo/two.png|320]]",
      "- AnimeList/Images/demo/one.jpg",
      "",
    ].join("\n")), [
      "AnimeList/Images/demo/one.jpg",
      "AnimeList/Images/demo/two.png",
    ]);
    assert.equal(serializeImageSectionPaths(["a.jpg", "b.png"]), "- a.jpg\n- b.png");
    assert.equal(normalizeImageSectionPath("- ![[folder/image.webp|200]]"), "folder/image.webp");
  });

  it("fingerprints exact image bytes independently of filenames", async () => {
    const first = await imageContentHash(new Uint8Array([1, 2, 3, 4]).buffer);
    const renamed = await imageContentHash(new Uint8Array([1, 2, 3, 4]).buffer);
    const changed = await imageContentHash(new Uint8Array([1, 2, 3, 5]).buffer);
    assert.equal(first, renamed);
    assert.notEqual(first, changed);
    assert.match(first, /^[0-9a-f]{64}$/);
  });

  it("updates only the selected reusable image section and preserves the rest of the note", () => {
    const markdown = [
      "---", "title: Demo", "custom: keep", "---", "",
      "# Demo", "", "## Screenshots", "```animelist-images", "- Images/shot-1.jpg", "```", "",
      "Personal paragraph that must stay untouched.", "",
      "## Official art", "```animelist-images", "- Images/key-1.png", "```", "",
    ].join("\n");
    const blocks = findImageSectionBlocks(markdown);
    assert.equal(blocks.length, 2);
    const updated = replaceImageSectionPaths(markdown, {
      source: blocks[1].source,
      lineStart: blocks[1].lineStart,
      lineEnd: blocks[1].lineEnd,
    }, ["Images/key-1.png", "Images/key-2.webp"]);

    assert.match(updated, /custom: keep/);
    assert.match(updated, /Personal paragraph that must stay untouched\./);
    assert.match(updated, /## Screenshots\n```animelist-images\n- Images\/shot-1\.jpg\n```/);
    assert.match(updated, /## Official art\n```animelist-images\n- Images\/key-1\.png\n- Images\/key-2\.webp\n```/);
    assert.deepEqual(allImageSectionPaths(updated), [
      "Images/shot-1.jpg", "Images/key-1.png", "Images/key-2.webp",
    ]);
  });

  it("uses stable managed folders without adding a new settings schema", () => {
    assert.equal(imageSectionRootFromCoverFolder("AnimeList/Covers"), "AnimeList/Images");
    assert.equal(imageSectionFolderForNote({
      coverFolder: "AnimeList/Covers",
      mediaType: "anime",
      title: "葬送的芙莉蓮",
      sourceProvider: "bangumi",
      sourceId: "400602",
      notePath: "AnimeList/Anime/Frieren.md",
    }), "AnimeList/Images/anime/葬送的芙莉蓮-bangumi-400602");
    assert.equal(imageExtensionFor("poster.JPEG"), "jpg");
    assert.equal(imageExtensionFor("image", "image/avif; charset=binary"), "avif");
    assert.equal(imageExtensionFor("file.svg", "image/svg+xml"), null);
  });
  it("plans context-menu insertion without replacing existing note text", () => {
    assert.deepEqual(imageSectionInsertionPlan(8, "A paragraph that must stay"), {
      at: { line: 8, ch: 26 },
      text: "\n\n```animelist-images\n```\n",
      cursor: { line: 12, ch: 0 },
    });
    assert.deepEqual(imageSectionInsertionPlan(3, "   "), {
      at: { line: 3, ch: 0 },
      text: "```animelist-images\n```\n",
      cursor: { line: 5, ch: 0 },
    });
  });

});
