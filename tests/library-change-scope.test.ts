import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLibraryRelevantPath, pathBelongsToLibraryRoot } from "../src/data/library-change-scope";

describe("library change scope", () => {
  it("matches configured media roots and the cover folder only", () => {
    const roots = ["AnimeList", "Archive"];
    assert.equal(isLibraryRelevantPath("AnimeList/Anime/a.md", roots, "AnimeList/Covers"), true);
    assert.equal(isLibraryRelevantPath("Archive/Manga/b.md", roots, "AnimeList/Covers"), true);
    assert.equal(isLibraryRelevantPath("AnimeList/Covers/a.webp", roots, "AnimeList/Covers"), true);
    assert.equal(isLibraryRelevantPath("Notes/unrelated.md", roots, "AnimeList/Covers"), false);
  });

  it("treats an empty flat root as vault-root files only", () => {
    assert.equal(pathBelongsToLibraryRoot("root-media.md", ""), true);
    assert.equal(pathBelongsToLibraryRoot("Folder/root-media.md", ""), false);
  });

  it("matches a renamed root itself as well as descendants", () => {
    assert.equal(pathBelongsToLibraryRoot("AnimeList", "AnimeList"), true);
    assert.equal(pathBelongsToLibraryRoot("AnimeList/Novel/item.md", "AnimeList"), true);
  });
});
