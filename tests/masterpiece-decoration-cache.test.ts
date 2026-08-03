import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MasterpieceDecorationCache } from "../src/masterpiece-decoration-cache";
import type { MediaItem } from "../src/types";

function item(path: string, title = path): MediaItem {
  return {
    title,
    originalTitle: "",
    mediaType: "anime",
    format: "anime",
    status: "ongoing",
    releaseStatus: "unknown",
    progress: 0,
    total: 0,
    unit: "episode",
    score: null,
    favorite: false,
    year: "",
    genres: [],
    people: [],
    platforms: [],
    sourceUrls: [],
    cover: "",
    filePath: path,
    updated: 0,
    updatedLabel: "",
    startedAt: "",
    completedAt: "",
    volumeLog: [],
  };
}

describe("masterpiece media decoration cache", () => {
  it("reuses one decoration for the same host and indexed item identity", () => {
    const cache = new MasterpieceDecorationCache();
    const host = {};
    const base = item("AnimeList/Anime/a.md");
    let reads = 0;
    const create = () => {
      reads += 1;
      return { ...base, title: `decorated-${reads}` };
    };

    const first = cache.getOrCreate(host, base, create);
    const second = cache.getOrCreate(host, base, create);
    assert.equal(reads, 1);
    assert.equal(second, first);
  });

  it("redecorates when the media index replaces an item object", () => {
    const cache = new MasterpieceDecorationCache();
    const host = {};
    const firstBase = item("AnimeList/Anime/a.md", "before");
    const nextBase = item("AnimeList/Anime/a.md", "after");
    let reads = 0;

    const first = cache.getOrCreate(host, firstBase, () => { reads += 1; return { ...firstBase }; });
    const next = cache.getOrCreate(host, nextBase, () => { reads += 1; return { ...nextBase }; });
    assert.equal(reads, 2);
    assert.notEqual(next, first);
    assert.equal(next.title, "after");
  });

  it("does not share decorated objects across plugin hosts", () => {
    const cache = new MasterpieceDecorationCache();
    const base = item("AnimeList/Anime/a.md");
    let reads = 0;
    const create = () => { reads += 1; return { ...base, title: String(reads) }; };

    const first = cache.getOrCreate({}, base, create);
    const second = cache.getOrCreate({}, base, create);
    assert.equal(reads, 2);
    assert.notEqual(second, first);
  });
});
