import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldRefreshAnimeListBlockPath,
  shouldRefreshAnimeListBlockRename,
} from "../src/ui/markdown-refresh-scope";

describe("Markdown AnimeList block refresh scope", () => {
  const roots = ["AnimeList", "Archive"];
  const covers = "AnimeList/Covers";

  it("uses configured Library roots when the block has no explicit source", () => {
    assert.equal(shouldRefreshAnimeListBlockPath("Notes/unrelated.md", undefined, roots, covers), false);
    assert.equal(shouldRefreshAnimeListBlockPath("AnimeList/Anime/example.md", undefined, roots, covers), true);
    assert.equal(shouldRefreshAnimeListBlockPath("Archive/Novel/example.md", undefined, roots, covers), true);
    assert.equal(shouldRefreshAnimeListBlockPath("AnimeList/Covers/example.webp", undefined, roots, covers), true);
  });

  it("limits a source-scoped block to that source plus covers", () => {
    assert.equal(shouldRefreshAnimeListBlockPath("Archive/Manga/example.md", "Archive/Manga", roots, covers), true);
    assert.equal(shouldRefreshAnimeListBlockPath("AnimeList/Anime/example.md", "Archive/Manga", roots, covers), false);
    assert.equal(shouldRefreshAnimeListBlockPath("AnimeList/Covers/example.webp", "Archive/Manga", roots, covers), true);
  });

  it("refreshes a source-scoped block when either side of a rename crosses its scope", () => {
    assert.equal(shouldRefreshAnimeListBlockRename(
      "Archive/Manga/a.md", "Notes/a.md", "Archive/Manga", roots, covers,
    ), true);
    assert.equal(shouldRefreshAnimeListBlockRename(
      "Notes/a.md", "Archive/Manga/a.md", "Archive/Manga", roots, covers,
    ), true);
    assert.equal(shouldRefreshAnimeListBlockRename(
      "Notes/a.md", "Notes/b.md", "Archive/Manga", roots, covers,
    ), false);
  });
});
