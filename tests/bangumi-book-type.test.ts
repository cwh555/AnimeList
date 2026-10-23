import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bangumiBookMediaType } from "../src/domain/bangumi-book-type";
import { BangumiClient } from "../src/data/providers/bangumi-client";
import { setRequestUrlMock } from "./mocks/obsidian";

describe("Bangumi Book media classification", () => {
  it("identifies only explicit evidence, not keywords from a title", () => {
    assert.equal(bangumiBookMediaType("漫画"), "manga");
    assert.equal(bangumiBookMediaType("輕小說"), "novel");
    assert.equal(bangumiBookMediaType("Book", [], ["文庫"]), "novel");
    assert.equal(bangumiBookMediaType("Book", ["漫画"], []), "manga");
    assert.equal(bangumiBookMediaType("Book"), null);
    assert.equal(bangumiBookMediaType("漫画 小説"), null);
    assert.equal(bangumiBookMediaType("", ["漫画改"]), null);
  });

  it("does not present confirmed manga as novels or novels as manga", async () => {
    setRequestUrlMock(() => ({
      json: {
        total: 2,
        data: [
          { id: 1, name: "Manga", platform: "漫画", images: {}, rating: {}, infobox: [] },
          { id: 2, name: "Novel", platform: "轻小说", images: {}, rating: {}, infobox: [] },
        ],
      },
      text: "",
    }));
    try {
      const client = new BangumiClient();
      const novels = await client.searchPage("novel", "作品", 1);
      const manga = await client.searchPage("manga", "作品", 1);
      assert.deepEqual(novels.results.map(x => x.sourceId), ["2"]);
      assert.deepEqual(manga.results.map(x => x.sourceId), ["1"]);
      assert.equal(novels.hasMore, false);
    } finally {
      setRequestUrlMock(null);
    }
  });
});
