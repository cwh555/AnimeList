import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { managedMediaAssetKind, shouldRemoveManagedMediaAsset } from "../src/domain/media-asset-cleanup";
import { extractFrontmatterCoverTargets, extractMarkdownAssetTargets } from "../src/domain/media-asset-references";

describe("media asset cleanup policy", () => {
  it("recognizes only strict AnimeList managed cover and image layouts", () => {
    assert.equal(managedMediaAssetKind("AnimeList/Covers/anime/demo.jpg", "AnimeList/Covers"), "cover");
    assert.equal(managedMediaAssetKind("AnimeList/Images/anime/demo-bangumi-1/frame.png", "AnimeList/Covers"), "image");
    assert.equal(managedMediaAssetKind("AnimeList/Covers/user-file.jpg", "AnimeList/Covers"), null);
    assert.equal(managedMediaAssetKind("AnimeList/Images/user-file.png", "AnimeList/Covers"), null);
    assert.equal(managedMediaAssetKind("AnimeList/Covers/anime/demo.txt", "AnimeList/Covers"), null);
  });

  it("never removes a referenced or leased managed asset", () => {
    const path = "AnimeList/Covers/anime/demo.jpg";
    assert.equal(shouldRemoveManagedMediaAsset(path, "AnimeList/Covers", new Set(), new Set()), true);
    assert.equal(shouldRemoveManagedMediaAsset(path, "AnimeList/Covers", new Set([path]), new Set()), false);
    assert.equal(shouldRemoveManagedMediaAsset(path, "AnimeList/Covers", new Set(), new Set([path])), false);
  });

  it("finds cover, wiki, Markdown-link, Image Section, and Moments references from raw Markdown", () => {
    const targets = new Set(extractMarkdownAssetTargets([
      "---",
      'cover: "AnimeList/Covers/anime/demo.jpg"',
      "---",
      "![[AnimeList/Images/anime/demo-bangumi-1/wiki.png|320]]",
      "![linked](AnimeList/Images/anime/demo-bangumi-1/markdown.png)",
      "```animelist-images",
      "- AnimeList/Images/anime/demo-bangumi-1/gallery.png",
      "```",
      "```animelist-moments",
      "moments:",
      "  - id: m_one",
      "    text: quote",
      "    images:",
      "      - AnimeList/Images/anime/demo-bangumi-1/moment.png",
      "```",
    ].join("\n")));
    for (const expected of [
      "AnimeList/Covers/anime/demo.jpg",
      "AnimeList/Images/anime/demo-bangumi-1/wiki.png",
      "AnimeList/Images/anime/demo-bangumi-1/markdown.png",
      "AnimeList/Images/anime/demo-bangumi-1/gallery.png",
      "AnimeList/Images/anime/demo-bangumi-1/moment.png",
    ]) assert.equal(targets.has(expected), true, expected);
  });

  it("finds nested frontmatter covers such as serial volume covers", () => {
    const targets = extractFrontmatterCoverTargets({
      cover: "AnimeList/Covers/manga/main.jpg",
      volume_log: [{ label: "1", cover: "AnimeList/Covers/manga/volume-1.jpg" }],
      unrelated: { path: "AnimeList/Covers/manga/not-a-cover.jpg" },
    });
    assert.deepEqual(targets.sort(), [
      "AnimeList/Covers/manga/main.jpg",
      "AnimeList/Covers/manga/volume-1.jpg",
    ]);
  });
});
