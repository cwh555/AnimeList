import assert from "node:assert/strict";
import { after, before, describe, it, test } from "node:test";
import { setRequestUrlMock } from "../mocks/obsidian";
import { AniListClient } from "../../src/data/providers/anilist-client";
import { BangumiClient } from "../../src/data/providers/bangumi-client";
import { OpenLibraryClient } from "../../src/data/providers/open-library-client";
import { SerialVolumeCatalogService } from "../../src/data/serial-covers/volume-catalog-service";
import { matchesCatalogVolume } from "../../src/domain/serial-covers/catalog";

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
    studios: { nodes: [{ name: "Production Test", isAnimationStudio: false }, { name: "Studio Test", isAnimationStudio: true }] },
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


  it("fetches an exact Bangumi subject by source ID for legacy metadata recovery", async () => {
    let request: any;
    setRequestUrlMock((options) => {
      request = options;
      return {
        json: {
          id: 241418,
          name: "からかい上手の高木さん OVA",
          name_cn: "擅長捉弄的高木同學 OVA",
          date: "2018-07-12",
          platform: "OVA",
          images: {},
          rating: {},
          tags: [{ name: "恋爱" }, { name: "2018年7月" }, { name: "SHIN-EI" }],
          infobox: [{ key: "動畫製作", value: "SHIN-EI" }],
        },
        text: "",
      };
    });
    try {
      const result = await new BangumiClient().fetchById("anime", "241418");
      assert.equal(request.method, "GET");
      assert.match(request.url, /\/v0\/subjects\/241418$/);
      assert.equal(result?.sourceId, "241418");
      assert.deepEqual(result?.people, ["SHIN-EI"]);
      assert.equal(result?.startDate?.year, 2018);
      assert.equal(result?.startDate?.month, 7);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("recovers a missing anime studio from Bangumi structured subject-person relations", async () => {
    const urls: string[] = [];
    setRequestUrlMock((options) => {
      urls.push(options.url);
      if (options.url.endsWith("/persons")) {
        return {
          json: [
            { id: 1, name: "Aniplex", type: 2, relation: "製作", career: [], eps: "" },
            { id: 32356, name: "CloverWorks", type: 2, relation: "动画制作", career: [], eps: "" },
            { id: 3, name: "Individual Producer", type: 1, relation: "动画制作", career: [], eps: "" },
          ],
          text: "",
        };
      }
      return {
        json: {
          id: 240038,
          name: "青春ブタ野郎はバニーガール先輩の夢を見ない",
          name_cn: "青春猪头少年不会梦到兔女郎学姐",
          date: "2018-10-04",
          platform: "TV",
          images: {},
          rating: {},
          tags: [],
          infobox: [],
        },
        text: "",
      };
    });
    try {
      const result = await new BangumiClient().fetchById("anime", "240038");
      assert.deepEqual(urls, [
        "https://api.bgm.tv/v0/subjects/240038",
        "https://api.bgm.tv/v0/subjects/240038/persons",
      ]);
      assert.deepEqual(result?.people, ["CloverWorks"]);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("does not spend a second Bangumi request when explicit animation-studio metadata already exists", async () => {
    let calls = 0;
    setRequestUrlMock(() => {
      calls += 1;
      return {
        json: {
          id: 183878,
          name: "ヴァイオレット・エヴァーガーデン",
          name_cn: "紫罗兰永恒花园",
          date: "2018-01-10",
          platform: "TV",
          images: {},
          rating: {},
          tags: [],
          infobox: [{ key: "动画制作", value: "京都アニメーション" }],
        },
        text: "",
      };
    });
    try {
      const result = await new BangumiClient().fetchById("anime", "183878");
      assert.equal(calls, 1);
      assert.deepEqual(result?.people, ["京都アニメーション"]);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("fails open when Bangumi structured studio relations are temporarily unavailable", async () => {
    let calls = 0;
    setRequestUrlMock((options) => {
      calls += 1;
      if (options.url.endsWith("/persons")) throw new Error("temporary Bangumi persons failure");
      return {
        json: {
          id: 245665,
          name: "鬼滅の刃",
          name_cn: "鬼灭之刃",
          date: "2019-04-06",
          platform: "TV",
          images: {},
          rating: {},
          tags: [],
          infobox: [],
        },
        text: "",
      };
    });
    try {
      const result = await new BangumiClient().fetchById("anime", "245665");
      assert.equal(calls, 2);
      assert.deepEqual(result?.people, []);
      assert.equal(result?.sourceId, "245665");
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("uses only explicit Bangumi animation-production roles for studios", async () => {
    setRequestUrlMock(() => ({
      json: {
        id: 355199,
        name: "Re:Monster",
        name_cn: "怪物转生",
        date: "2024-04-01",
        platform: "TV",
        images: {},
        rating: {},
        tags: [],
        infobox: [
          { key: "动画制作", value: "スタジオディーン" },
          { key: "製作会社", value: "コロリド・ツインエンジンパートナーズ（アニメーション制作：スタジオコロリド＝スタジオクロマト）" },
          { key: "监制", value: "ジェンコ" },
          { key: "制作", value: "制片：ジェンコ" },
        ],
      },
      text: "",
    }));
    try {
      const result = await new BangumiClient().fetchById("anime", "355199");
      assert.deepEqual(result?.people, ["スタジオディーン"]);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("does not promote a generic Bangumi production-company field to animation studio metadata", async () => {
    setRequestUrlMock(() => ({
      json: {
        id: 999001,
        name: "超かぐや姫！",
        name_cn: "超時空輝夜姬！",
        date: "2026-01-22",
        platform: "WEB",
        images: {},
        rating: {},
        tags: [],
        infobox: [
          { key: "製作会社", value: "コロリド・ツインエンジンパートナーズ（アニメーション制作：スタジオコロリド＝スタジオクロマト）" },
        ],
      },
      text: "",
    }));
    try {
      const result = await new BangumiClient().fetchById("anime", "999001");
      assert.deepEqual(result?.people, []);
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
      assert.match(body.query, /studios\(isMain: true\) \{ nodes \{ id name isAnimationStudio \} \}/);
      assert.deepEqual(page.results.map((item) => item.sourceId), ["1"]);
      assert.deepEqual(page.results[0]?.classification?.studios, ["Studio Test"]);
      assert.equal(page.hasMore, true);
    } finally {
      setRequestUrlMock(null);
    }
  });


  it("fetches official manga streaming links by a preserved AniList identity", async () => {
    let body: any;
    setRequestUrlMock((options) => {
      body = JSON.parse(options.body ?? "{}");
      return {
        json: {
          data: {
            Media: {
              id: 87395,
              title: { romaji: "Grand Blue", english: "Grand Blue Dreaming", native: "ぐらんぶる" },
              synonyms: ["碧藍之海"],
              externalLinks: [
                { site: "Comic Days", url: "https://comic-days.com/episode/old", type: "STREAMING", language: "Japanese" },
                { site: "Official Site", url: "https://afternoon.kodansha.co.jp/c/grandblue.html", type: "INFO", language: "Japanese" },
              ],
            },
          },
        },
        text: "",
      };
    });
    try {
      const result = await new AniListClient().fetchMangaReleaseSources("87395");
      assert.equal(body.variables.id, 87395);
      assert.match(body.query, /externalLinks \{ site url type language \}/);
      assert.deepEqual(result?.titles, ["ぐらんぶる", "Grand Blue", "Grand Blue Dreaming", "碧藍之海"]);
      assert.equal(result?.externalLinks[0]?.site, "Comic Days");
      assert.equal(result?.externalLinks[1]?.type, "INFO");
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

  it("does not create replacement transport requests while a timed-out request remains pending", async () => {
    let calls = 0;
    setRequestUrlMock(() => {
      calls++;
      return new Promise(() => {});
    });
    try {
      const client = new AniListClient({ requestTimeoutMs: 5, requestIntervalMs: 0 });
      const [first, second] = await Promise.allSettled([
        client.searchPage("anime", "Stuck A", 1),
        client.searchPage("anime", "Stuck B", 1),
      ]);
      assert.equal(first.status, "rejected");
      assert.equal(second.status, "rejected");
      assert.equal(calls, 1);
      assert.match((first as PromiseRejectedResult).reason.message, /timed out/);
      assert.match((second as PromiseRejectedResult).reason.message, /cooling down/);
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
        requestIntervalMs: 0,
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
      const client = new AniListClient({ requestIntervalMs: 0, sleep: async () => {} });
      const page = await client.searchPage("anime", "Retry", 1);
      assert.equal(calls, 2);
      assert.equal(page.results[0]?.sourceId, "30");
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("paces different AniList queries using one sequential queue at the degraded 30/min limit", async () => {
    let clock = 10_000;
    const starts: number[] = [];
    const sleeps: number[] = [];
    setRequestUrlMock(() => {
      starts.push(clock);
      return {
        headers: { "X-RateLimit-Limit": "30", "X-RateLimit-Remaining": "28" },
        json: { data: { Page: { pageInfo: { hasNextPage: false }, media: [aniListMedia(42)] } } },
        text: "",
      };
    });
    try {
      const client = new AniListClient({
        now: () => clock,
        sleep: async (ms) => { sleeps.push(ms); clock += ms; },
      });
      const pages = await Promise.all([
        client.searchPage("anime", "First", 1),
        client.searchPage("anime", "Second", 1),
        client.searchPage("anime", "Third", 1),
      ]);
      assert.deepEqual(starts, [10_000, 12_100, 14_200]);
      assert.deepEqual(sleeps, [2_100, 2_100]);
      assert.ok(pages.every(page => page.results[0]?.sourceId === "42"));
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("stops every queued query after a 403 GraphQL outage response", async () => {
    let clock = 20_000;
    let calls = 0;
    setRequestUrlMock(() => {
      calls++;
      if (calls === 1) {
        return {
          headers: {},
          json: { data: null, errors: [{
            status: 403,
            message: "The AniList API has been temporarily disabled due to severe stability issues.",
          }] },
          text: "",
        };
      }
      return {
        headers: {},
        json: { data: { Page: { pageInfo: { hasNextPage: false }, media: [aniListMedia(44)] } } },
        text: "",
      };
    });
    try {
      const client = new AniListClient({
        requestIntervalMs: 0, now: () => clock, forbiddenCooldownMs: 60_000,
      });
      const attempted = await Promise.allSettled([
        client.searchPage("anime", "One", 1),
        client.searchPage("anime", "Two", 1),
        client.searchPage("anime", "Three", 1),
      ]);
      assert.equal(calls, 1);
      assert.ok(attempted.every(x => x.status === "rejected"));
      assert.match((attempted[0] as PromiseRejectedResult).reason.message, /HTTP 403/);
      assert.match((attempted[0] as PromiseRejectedResult).reason.message, /temporarily disabled/);
      await assert.rejects(() => client.searchPage("anime", "Four", 1), /cooling down/);
      assert.equal(calls, 1);
      clock += 60_001;
      const recovered = await client.searchPage("anime", "After cooldown", 1);
      assert.equal(recovered.results[0]?.sourceId, "44");
      assert.equal(calls, 2);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("handles direct HTTP 403 without retrying, and does not affect another provider", async () => {
    let calls = 0;
    setRequestUrlMock(() => {
      calls++;
      const error = new Error("Request failed with status 403") as Error & { status: number };
      error.status = 403;
      throw error;
    });
    try {
      const client = new AniListClient({ requestIntervalMs: 0 });
      await assert.rejects(() => client.fetchMediaById("anime", 15), /HTTP 403/);
      await assert.rejects(() => client.searchPage("anime", "Other", 1), /cooling down/);
      assert.equal(calls, 1);
    } finally {
      setRequestUrlMock(null);
    }
  });

  it("honors a long 429 Retry-After as a circuit pause without repeated calls", async () => {
    let clock = 1_000;
    let calls = 0;
    setRequestUrlMock(() => {
      calls++;
      if (calls === 1) {
        const error = new Error("Request failed with status 429") as Error & {
          status: number; response: { headers: Record<string, string> };
        };
        error.status = 429;
        error.response = { headers: { "Retry-After": "30" } };
        throw error;
      }
      return { headers: {}, json: { data: { Page: { pageInfo: { hasNextPage: false }, media: [] } } }, text: "" };
    });
    try {
      const client = new AniListClient({ requestIntervalMs: 0, now: () => clock });
      await assert.rejects(() => client.searchPage("anime", "One", 1), /429/);
      await assert.rejects(() => client.searchPage("anime", "Two", 1), /cooling down/);
      assert.equal(calls, 1);
      clock += 30_001;
      await client.searchPage("anime", "Recovered", 1);
      assert.equal(calls, 2);
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

/** Captured response fields from public APIs, GitHub Actions run 45733961345. */
const capturedRelations = [
  {
    "id": 561419,
    "name": "イヴと偽りの天使たち ロクでなし魔術講師と禁忌教典【正典】",
    "relation": "相同世界观",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/fc/bb/561419_QtWQO.jpg"
    }
  },
  {
    "id": 530025,
    "name": "ロクでなし魔術講師と福音後記",
    "relation": "番外篇",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/89/23/530025_HnsDS.jpg"
    }
  },
  {
    "id": 162853,
    "name": "ロクでなし魔術講師と禁忌教典",
    "relation": "书籍",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/42/13/162853_f9aF0.jpg"
    }
  },
  {
    "id": 174138,
    "name": "ロクでなし魔術講師と禁忌教典",
    "relation": "动画",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/b2/af/174138_0BOO7.jpg"
    }
  },
  {
    "id": 212926,
    "name": "ロクでなし魔術講師と追想日誌",
    "relation": "番外篇",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/a3/5a/212926_8Jyfw.jpg"
    }
  },
  {
    "id": 109636,
    "name": "ロクでなし魔術講師と禁忌教典 (1)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/fa/5f/109636_jp.jpg"
    }
  },
  {
    "id": 339465,
    "name": "ロクでなし魔術講師と絵画回想 三嶋くろね画集 vol.1",
    "relation": "画集",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/e5/05/339465_67V6A.jpg"
    }
  },
  {
    "id": 143639,
    "name": "ロクでなし魔術講師と禁忌教典 (2)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/c5/66/143639_jp.jpg"
    }
  },
  {
    "id": 347383,
    "name": "ロクでなし魔術講師と絵画回想 三嶋くろね画集 vol.2",
    "relation": "画集",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/43/03/347383_LudO3.jpg"
    }
  },
  {
    "id": 146901,
    "name": "ロクでなし魔術講師と禁忌教典 (3)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/e6/3c/146901_jp.jpg"
    }
  },
  {
    "id": 537994,
    "name": "ロクでなし魔術講師と絵画回想 三嶋くろね画集 vol.3",
    "relation": "画集",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/13/7d/537994_RJ9ig.jpg"
    }
  },
  {
    "id": 146902,
    "name": "ロクでなし魔術講師と禁忌教典 (4)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/b4/1f/146902_jp.jpg"
    }
  },
  {
    "id": 159307,
    "name": "ロクでなし魔術講師と禁忌教典 (5)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/53/0e/159307_jp.jpg"
    }
  },
  {
    "id": 186910,
    "name": "ロクでなし魔術講師と禁忌教典 (6)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/e0/6d/186910_jp.jpg"
    }
  },
  {
    "id": 195825,
    "name": "ロクでなし魔術講師と禁忌教典 (7)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/fa/01/195825_jp.jpg"
    }
  },
  {
    "id": 208683,
    "name": "ロクでなし魔術講師と禁忌教典 (8)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/52/cf/208683_1o1MM.jpg"
    }
  },
  {
    "id": 220280,
    "name": "ロクでなし魔術講師と禁忌教典 (9)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/ef/cf/220280_vA0ND.jpg"
    }
  },
  {
    "id": 230954,
    "name": "ロクでなし魔術講師と禁忌教典 (10)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/b0/4e/230954_Q4U6Q.jpg"
    }
  },
  {
    "id": 240819,
    "name": "ロクでなし魔術講師と禁忌教典 (11)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/af/3a/240819_f08fU.jpg"
    }
  },
  {
    "id": 253656,
    "name": "ロクでなし魔術講師と禁忌教典 (12)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/99/5e/253656_GDvpq.jpg"
    }
  },
  {
    "id": 265797,
    "name": "ロクでなし魔術講師と禁忌教典 (13)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/e8/b0/265797_4rZn5.jpg"
    }
  },
  {
    "id": 278375,
    "name": "ロクでなし魔術講師と禁忌教典 (14)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/16/82/278375_dyW9y.jpg"
    }
  },
  {
    "id": 287653,
    "name": "ロクでなし魔術講師と禁忌教典 (15)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/5b/af/287653_6SBz6.jpg"
    }
  },
  {
    "id": 296885,
    "name": "ロクでなし魔術講師と禁忌教典 (16)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/df/a2/296885_8p6Zx.jpg"
    }
  },
  {
    "id": 313275,
    "name": "ロクでなし魔術講師と禁忌教典 (17)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/33/b0/313275_YM7o9.jpg"
    }
  },
  {
    "id": 324599,
    "name": "ロクでなし魔術講師と禁忌教典 (18)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/39/23/324599_7mj7J.jpg"
    }
  },
  {
    "id": 338061,
    "name": "ロクでなし魔術講師と禁忌教典 (19)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/65/84/338061_47iIo.jpg"
    }
  },
  {
    "id": 368746,
    "name": "ロクでなし魔術講師と禁忌教典 (20)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/0f/ff/368746_a89Gu.jpg"
    }
  },
  {
    "id": 379880,
    "name": "ロクでなし魔術講師と禁忌教典 (21)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/49/b8/379880_dd8oJ.jpg"
    }
  },
  {
    "id": 423177,
    "name": "ロクでなし魔術講師と禁忌教典 (22)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/91/de/423177_g3S3C.jpg"
    }
  },
  {
    "id": 453265,
    "name": "ロクでなし魔術講師と禁忌教典 (23)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/37/f2/453265_1zd4u.jpg"
    }
  },
  {
    "id": 453266,
    "name": "ロクでなし魔術講師と禁忌教典 (24)",
    "relation": "单行本",
    "images": {
      "large": "https://lain.bgm.tv/pic/cover/l/74/4f/453266_6e969.jpg"
    }
  }
];
const capturedEditions = [
  {
    "key": "/books/OL62062462M",
    "title": "Spice & Wolf, Volume 17: Epilogue",
    "covers": [
      15224055
    ],
    "isbn_13": [
      "9798855426090"
    ]
  },
  {
    "key": "/books/OL51080297M",
    "title": "Spice and Wolf, Volume 17: Epilogue",
    "covers": [
      14841282
    ],
    "isbn_13": [
      "9780316559188"
    ]
  },
  {
    "key": "/books/OL31964528M",
    "title": "Spice and Wolf, Volume 17: Epilogue",
    "covers": [
      14841284
    ],
    "isbn_13": [
      "9780316339643"
    ]
  }
];

test("publication catalog finds all 24 real related volume identities, excludes other relations, and reuses series cache", async () => {
  const title = "ロクでなし魔術講師と禁忌教典";
  const calls: string[] = [];
  setRequestUrlMock(options => {
    calls.push(options.url);
    if (options.url.endsWith("/109635/subjects")) return { json: capturedRelations };
    if (options.url.endsWith("/109635")) return { json: { id: 109635, name: title, platform: "小说" } };
    throw new Error("Unexpected request: " + options.url);
  });
  try {
    const catalog = new SerialVolumeCatalogService(() => ({ bangumi: true, anilist: false, openlibrary: false }), {
      bangumi: new BangumiClient(), openlibrary: new OpenLibraryClient(),
    });
    const request = {
      mediaType: "novel" as const, originalTitle: title, queryTitle: title, aliases: [],
      sources: [{ provider: "bangumi", sourceId: "109635", sourceUrl: "" }], manual: false,
    };
    const expected = capturedRelations.filter(entry => entry.relation === "单行本");
    assert.equal(expected.length, 24);
    for (let index = 0; index < 24; index += 1) {
      const result = await catalog.search({ ...request, label: String(index + 1) });
      assert.deepEqual(result.verified.map(entry => entry.sourceId), [String(expected[index].id)]);
      assert.equal(result.verified[0]?.coverUrl, expected[index].images.large);
      assert.deepEqual(result.warnings, []);
    }
    assert.deepEqual((await catalog.search({ ...request, label: "25" })).verified, []);
    assert.deepEqual((await catalog.search({ ...request, label: "26" })).verified, []);
    assert.equal(calls.length, 2);
  } finally { setRequestUrlMock(null); }
});

test("Open Library editions preserve different cover IDs without guessing book type", async () => {
  const title = "Spice and Wolf";
  setRequestUrlMock(options => {
    if (options.url.includes("/search.json")) return { json: { numFound: 1, start: 0, docs: [{
      key: "/works/OL24202662W", title: "Spice and Wolf, Volume 17: Epilogue",
      editions: { docs: [] },
    }] } };
    if (options.url.includes("/OL24202662W/editions.json")) return { json: { entries: capturedEditions } };
    throw new Error("Unexpected request: " + options.url);
  });
  try {
    const catalog = new SerialVolumeCatalogService(() => ({ bangumi: false, anilist: false, openlibrary: true }), {
      bangumi: new BangumiClient(), openlibrary: new OpenLibraryClient(),
    });
    const result = await catalog.search({
      mediaType: "novel", originalTitle: title, queryTitle: title, aliases: ["Spice & Wolf"],
      label: "17", sources: [], manual: true,
    });
    assert.deepEqual(result.verified, []);
    assert.deepEqual(new Set(result.alternatives.map(entry => entry.sourceId)), new Set(capturedEditions.map(entry => entry.key.replace("/books/", ""))));
    assert.equal(new Set(result.alternatives.map(entry => entry.coverUrl)).size, 3);
    assert.ok(result.alternatives.every(entry => !entry.mediaTypeHint));
  } finally { setRequestUrlMock(null); }
});

test("volume recognition excludes numbers inside series titles, other volumes and multi-volume sets", () => {
  assert.equal(matchesCatalogVolume("作品 (24)", ["作品"], "24"), true);
  assert.equal(matchesCatalogVolume("作品２４", ["作品"], "24"), true);
  assert.equal(matchesCatalogVolume("作品, Volume 24: Epilogue", ["作品"], "24"), true);
  assert.equal(matchesCatalogVolume("作品 24-26", ["作品"], "24"), false);
  assert.equal(matchesCatalogVolume("作品 124", ["作品"], "24"), false);
  assert.equal(matchesCatalogVolume("作品 Part 5 Volume 12", ["作品 Part 5"], "5"), false);
  assert.equal(matchesCatalogVolume("作品 Part 5 Volume 12", ["作品 Part 5"], "12"), true);
});
