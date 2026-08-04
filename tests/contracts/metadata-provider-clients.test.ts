import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setRequestUrlMock } from "../mocks/obsidian";
import { AniListClient } from "../../src/data/providers/anilist-client";
import { BangumiClient } from "../../src/data/providers/bangumi-client";
import { OpenLibraryClient } from "../../src/data/providers/open-library-client";

function aniListMedia(id: number, format = "TV"): unknown {
  return {
    id,
    siteUrl: `https://anilist.co/anime/${id}`,
    type: "ANIME",
    format,
    status: "FINISHED",
    episodes: 12,
    chapters: null,
    volumes: null,
    averageScore: 80,
    description: "",
    genres: [],
    synonyms: [],
    startDate: { year: 2026, month: 1, day: 1 },
    title: { romaji: `Title ${id}`, english: `Title ${id}`, native: `Title ${id}` },
    coverImage: { extraLarge: "", large: "", medium: "" },
    studios: { nodes: [] },
    staff: { edges: [] },
  };
}

describe("metadata provider clients", () => {
  it("keeps Bangumi pagination and media-type filtering inside the Bangumi client", async () => {
    let request: any;
    setRequestUrlMock((options) => {
      request = options;
      return {
        json: {
          total: 41,
          data: [{ id: 10, name: "原名", name_cn: "中文名", images: {}, rating: {} }],
        },
        text: "",
      };
    });
    try {
      const page = await new BangumiClient().searchPage("anime", "作品", 2);
      assert.match(request.url, /limit=20&offset=20$/);
      assert.equal(JSON.parse(request.body).filter.type[0], 2);
      assert.equal(page.results[0]?.provider, "bangumi");
      assert.equal(page.results[0]?.sourceId, "10");
      assert.equal(page.hasMore, true);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("keeps the AniList GraphQL query and page variables in one client", async () => {
    let body: any;
    setRequestUrlMock((options) => {
      body = JSON.parse(options.body ?? "{}");
      return {
        json: {
          data: {
            Page: {
              pageInfo: { hasNextPage: true },
              media: [aniListMedia(1, "MANGA"), aniListMedia(2, "NOVEL")],
            },
          },
        },
        text: "",
      };
    });
    try {
      const page = await new AniListClient().searchPage("manga", "作品", 3);
      assert.equal(body.variables.page, 3);
      assert.equal(body.variables.type, "MANGA");
      assert.equal(body.variables.format, null);
      assert.match(body.query, /pageInfo \{ hasNextPage \}/);
      assert.deepEqual(page.results.map((item) => item.sourceId), ["1"]);
      assert.equal(page.hasMore, true);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("keeps Open Library novel-only paging inside the Open Library client", async () => {
    let request: any;
    setRequestUrlMock((options) => {
      request = options;
      return {
        json: {
          numFound: 20,
          start: 8,
          docs: [{ key: "/works/OL1W", title: "Novel", author_name: ["Author"] }],
        },
        text: "",
      };
    });
    try {
      const client = new OpenLibraryClient();
      assert.equal(client.supports("anime"), false);
      assert.equal(client.supports("novel"), true);
      const page = await client.searchPage("novel", "小說", 2);
      assert.match(request.url, /limit=8&page=2&lang=zh$/);
      assert.equal(page.results[0]?.provider, "openlibrary");
      assert.equal(page.results[0]?.sourceId, "OL1W");
      assert.equal(page.hasMore, true);
    } finally {
      setRequestUrlMock(null);
    }
  });
});
