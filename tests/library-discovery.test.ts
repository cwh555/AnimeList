import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  discoverExistingMediaRoots,
  isAnimeListMediaFrontmatter,
  suggestedMediaRoot,
} from "../src/data/library-discovery";

describe("existing AnimeList data discovery", () => {
  it("recognizes only supported AnimeList media notes", () => {
    assert.equal(isAnimeListMediaFrontmatter({ media_type: "anime" }), true);
    assert.equal(isAnimeListMediaFrontmatter({ media_type: "manga" }), true);
    assert.equal(isAnimeListMediaFrontmatter({ media_type: "novel" }), true);
    assert.equal(isAnimeListMediaFrontmatter({ media_type: "podcast" }), false);
    assert.equal(isAnimeListMediaFrontmatter({ title: "ordinary note" }), false);
  });

  it("discovers legacy custom roots without duplicating configured roots", () => {
    const roots = discoverExistingMediaRoots([
      { path: "AnimeList/Anime/already.md", frontmatter: { media_type: "anime" } },
      { path: "Archive/Anime/legacy-a.md", frontmatter: { media_type: "anime" } },
      { path: "Archive/Manga/legacy-b.md", frontmatter: { media_type: "manga" } },
      { path: "Books/legacy-c.md", frontmatter: { media_type: "novel" } },
      { path: "Notes/ordinary.md", frontmatter: { title: "ordinary" } },
    ], ["AnimeList"]);

    assert.deepEqual(roots, ["Archive", "Books"]);
  });

  it("supports media notes stored directly at the vault root", () => {
    assert.equal(suggestedMediaRoot("root-media.md"), "/");
    assert.deepEqual(discoverExistingMediaRoots([
      { path: "root-media.md", frontmatter: { media_type: "anime" } },
    ], ["AnimeList"]), ["/"]);
  });
});
