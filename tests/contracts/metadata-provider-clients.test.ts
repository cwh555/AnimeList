import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { setRequestUrlMock } from "../mocks/obsidian";
import { AniListClient } from "../../src/data/providers/anilist-client";
import { BangumiClient } from "../../src/data/providers/bangumi-client";
import { OpenLibraryClient } from "../../src/data/providers/open-library-client";

const originalWindow = globalThis.window;
before(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout: (handler: TimerHandler, timeout?: number) => setTimeout(handler, timeout),
      clearTimeout: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
    } as unknown as Window & typeof globalThis,
  });
});
after(() => {
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

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
    season: "SPRING",
    seasonYear: 2026,
    source: "ORIGINAL",
    countryOfOrigin: "JP",
    tags: [{ name: "School", category: "Theme", rank: 80, isGeneralSpoiler: false, isMediaSpoiler: false, isAdult: false }],
    studios: { nodes: [{ name: "Studio Test" }] },
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
          data: [{
            id: 10,
            name: "原名",
            name_cn: "中文名",
            images: {},
            rating: {},
            tags: [
              { name: "恋爱" },
              { name: "校园" },
              { name: "CloverWorks" },
              { name: "漫画改" },
              { name: "2021年1月" },
              { name: "狗粮" },
              { name: "TV" },
              { name: "日常" },
              { name: "2021" },
              { name: "青春" },
              { name: "戸松遥" },
            ],
            infobox: [
              {
                key: "動畫製作",
                value: "CloverWorks、「ホリミヤ」製作委員会（Aniplex、マイシアターD.D.、毎日放送、スクウェア・エニックス、鐘通インベストメント、グローバル・ソリューションズ、ムービック、未来工場）岩上敦宏、石井紹良、丸山博雄、橋本真司、松井宏記、高麗大助、國枝信吾、近藤尚己",
              },
              { key: "製作", value: "「ホリミヤ」製作委員会" },
            ],
          }],
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
      assert.deepEqual(page.results[0]?.genres, ["戀愛", "日常"]);
      assert.deepEqual(page.results[0]?.rawGenres, ["戀愛", "日常"]);
      assert.deepEqual(page.results[0]?.people, ["CloverWorks"]);
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


  it("batches multilingual AniList query variants into one GraphQL request", async () => {
    let calls = 0;
    let body: any;
    setRequestUrlMock((options) => {
      calls += 1;
      body = JSON.parse(options.body ?? "{}");
      return {
        headers: { "X-RateLimit-Remaining": "29" },
        json: {
          data: {
            q0: { pageInfo: { hasNextPage: false }, media: [aniListMedia(11)] },
            q1: { pageInfo: { hasNextPage: false }, media: [aniListMedia(12)] },
            q2: { pageInfo: { hasNextPage: false }, media: [] },
          },
        },
        text: "",
      };
    });
    try {
      const pages = await new AniListClient().searchPages("anime", ["作品 第二季", "作品", "Work"], 1);
      assert.equal(calls, 1);
      assert.match(body.query, /q0: Page/);
      assert.match(body.query, /q1: Page/);
      assert.match(body.query, /q2: Page/);
      assert.equal(body.variables.search0, "作品 第二季");
      assert.equal(body.variables.search1, "作品");
      assert.equal(body.variables.search2, "Work");
      assert.deepEqual(pages.map((page) => page.results[0]?.sourceId ?? ""), ["11", "12", ""]);
      assert.equal(pages[0]?.results[0]?.classification?.tags[0]?.name, "School");
    } finally {
      setRequestUrlMock(null);
    }
  });


  it("derives quarter metadata from AniList startDate when season fields are absent", async () => {
    setRequestUrlMock(() => {
      const media = aniListMedia(31) as Record<string, any>;
      media.season = null;
      media.seasonYear = null;
      media.startDate = { year: 2024, month: 7, day: 2 };
      return {
        headers: {},
        json: { data: { Page: { pageInfo: { hasNextPage: false }, media: [media] } } },
        text: "",
      };
    });
    try {
      const page = await new AniListClient().searchPage("anime", "Quarter fallback", 1);
      assert.equal(page.results[0]?.classification?.season, "summer");
      assert.equal(page.results[0]?.classification?.seasonYear, 2024);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("deduplicates concurrent AniList requests and reuses the short-lived response cache", async () => {
    let calls = 0;
    setRequestUrlMock(async () => {
      calls += 1;
      await Promise.resolve();
      return {
        headers: {},
        json: { data: { Page: { pageInfo: { hasNextPage: false }, media: [aniListMedia(20)] } } },
        text: "",
      };
    });
    try {
      const client = new AniListClient();
      const [left, right] = await Promise.all([
        client.searchPage("anime", "Same", 1),
        client.searchPage("anime", "Same", 1),
      ]);
      const cached = await client.searchPage("anime", "Same", 1);
      assert.equal(calls, 1);
      assert.equal(left.results[0]?.sourceId, "20");
      assert.equal(right.results[0]?.sourceId, "20");
      assert.equal(cached.results[0]?.sourceId, "20");
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("bounds an unresponsive AniList request instead of blocking search indefinitely", async () => {
    setRequestUrlMock(() => new Promise(() => {}));
    try {
      const client = new AniListClient({ requestTimeoutMs: 5 });
      await assert.rejects(
        () => client.searchPage("anime", "Timeout", 1),
        /timed out after 5 ms/,
      );
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("honors a short AniList Retry-After once without starting a retry loop", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    setRequestUrlMock(() => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("Request failed with status 429") as Error & {
          status: number;
          response: { headers: Record<string, string> };
        };
        error.status = 429;
        error.response = { headers: { "Retry-After": "1" } };
        throw error;
      }
      return {
        headers: { "X-RateLimit-Remaining": "28" },
        json: { data: { Page: { pageInfo: { hasNextPage: false }, media: [aniListMedia(25)] } } },
        text: "",
      };
    });
    try {
      const client = new AniListClient({
        maxInteractiveRetryDelayMs: 1_500,
        sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      });
      const page = await client.searchPage("anime", "Rate Retry", 1);
      assert.equal(calls, 2);
      assert.deepEqual(sleeps, [1_000]);
      assert.equal(page.results[0]?.sourceId, "25");
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("fails fast on a long AniList Retry-After instead of blocking the interactive flow", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    setRequestUrlMock(() => {
      calls += 1;
      const error = new Error("Request failed with status 429") as Error & {
        status: number;
        response: { headers: Record<string, string> };
      };
      error.status = 429;
      error.response = { headers: { "Retry-After": "30" } };
      throw error;
    });
    try {
      const client = new AniListClient({
        maxInteractiveRetryDelayMs: 2_500,
        sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      });
      await assert.rejects(
        () => client.searchPage("anime", "Long Rate Limit", 1),
        /429/,
      );
      assert.equal(calls, 1);
      assert.deepEqual(sleeps, []);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("retries one transient AniList server failure without a retry loop", async () => {
    let calls = 0;
    setRequestUrlMock(() => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("Request failed with status 503") as Error & { status: number };
        error.status = 503;
        throw error;
      }
      return {
        headers: {},
        json: { data: { Page: { pageInfo: { hasNextPage: false }, media: [aniListMedia(30)] } } },
        text: "",
      };
    });
    try {
      const client = new AniListClient({ sleep: async () => {} });
      const page = await client.searchPage("anime", "Retry", 1);
      assert.equal(calls, 2);
      assert.equal(page.results[0]?.sourceId, "30");
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
