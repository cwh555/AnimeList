import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { setRequestUrlMock } from "../mocks/obsidian";
import { MangaDexReleaseClient } from "../../src/data/providers/mangadex-release-client";
import { OfficialMangaReleaseClient } from "../../src/data/providers/official-manga-release-client";
import { NdlReleaseClient } from "../../src/data/providers/ndl-release-client";

interface FakeNode {
  localName: string;
  tagName: string;
  textContent: string;
  children: FakeNode[];
  getElementsByTagName(name: string): FakeNode[];
}

function node(localName: string, textContent = "", children: FakeNode[] = []): FakeNode {
  return {
    localName,
    tagName: localName,
    textContent,
    children,
    getElementsByTagName(name: string): FakeNode[] {
      const descendants = this.children.flatMap((child) => [child, ...child.getElementsByTagName("*")]);
      return name === "*" ? descendants : descendants.filter((child) => child.localName === name);
    },
  };
}

const originalDomParser = globalThis.DOMParser;
afterEach(() => {
  setRequestUrlMock(null);
  if (originalDomParser === undefined) delete (globalThis as { DOMParser?: unknown }).DOMParser;
  else Object.defineProperty(globalThis, "DOMParser", { configurable: true, value: originalDomParser });
});

describe("release tracking provider clients", () => {
  it("queries MangaDex by title and keeps all localized candidate titles", async () => {
    let request: any;
    setRequestUrlMock((options) => {
      request = options;
      return {
        json: {
          data: [{
            id: "series-1",
            attributes: {
              title: { en: "Dandadan", ja: "ダンダダン" },
              altTitles: [{ zh: "膽大黨" }, { "zh-hk": "膽大黨" }],
            },
          }],
        },
        text: "",
      };
    });

    const result = await new MangaDexReleaseClient().search("膽大黨");
    assert.equal(request.method, "GET");
    assert.match(request.url, /^https:\/\/api\.mangadex\.org\/manga\?/);
    assert.match(request.url, /title=%E8%86%BD%E5%A4%A7%E9%BB%A8/);
    assert.deepEqual(result, [{
      id: "series-1",
      title: "Dandadan",
      altTitles: ["ダンダダン", "膽大黨"],
      sourceUrl: "https://mangadex.org/title/series-1",
    }]);
  });

  it("uses MangaDex aggregate metadata so translation duplicates cannot exhaust a feed page", async () => {
    let request: any;
    setRequestUrlMock((options) => {
      request = options;
      return {
        json: {
          result: "ok",
          volumes: {
            "20": {
              volume: "20",
              count: 103,
              chapters: {
                "241.5": { chapter: "241.5", count: 4, id: "ch-241-5", others: [] },
                "242": { chapter: "242", count: 96, id: "ch-242", others: [] },
                "242.1": { chapter: "242.1", count: 3, id: "ch-242-1", others: [] },
                "243": { chapter: "243", count: 1, id: "ch-243", others: [], isUnavailable: true },
                "extra": { chapter: "Extra", count: 1, id: "extra", others: [] },
              },
            },
          },
        },
        text: "",
      };
    });

    const latest = await new MangaDexReleaseClient().latestChapter("series-1");
    assert.equal(latest, "242");
    assert.equal(request.method, "GET");
    assert.equal(request.url, "https://api.mangadex.org/manga/series-1/aggregate");
    assert.doesNotMatch(request.url, /feed/);
    assert.doesNotMatch(request.url, /limit=100/);
  });

  it("follows Comic DAYS exact-title latest links instead of treating an old episode URL as current", async () => {
    const requests: string[] = [];
    setRequestUrlMock((options) => {
      requests.push(options.url);
      if (options.url.startsWith("https://comic-days.com/search?")) {
        return {
          text: `
            <ul class="series-list">
              <li data-title="ぐらんぶる 偽物">
                <a href="https://comic-days.com/episode/wrong" class="sub-link">最新話を読む</a>
              </li>
              <li data-title="ぐらんぶる">
                <div class="title-box">
                  <p class="series-title">ぐらんぶる</p>
                  <a href="https://comic-days.com/episode/latest-111" class="sub-link">最新話を読む</a>
                </div>
              </li>
            </ul>`,
        };
      }
      assert.equal(options.url, "https://comic-days.com/episode/latest-111");
      return { text: "<title>ぐらんぶる / 〖第111話後編〗勘違い | コミックDAYS</title><h1>〖第111話後編〗勘違い</h1>" };
    });

    const result = await new OfficialMangaReleaseClient().latestChapter(
      { id: "comic-days", label: "Comic DAYS", url: "https://comic-days.com/episode/old" },
      ["ぐらんぶる", "Grand Blue"],
    );
    assert.equal(result?.latest, "111");
    assert.equal(result?.sourceLabel, "Comic DAYS");
    assert.equal(result?.sourceUrl, "https://comic-days.com/episode/latest-111");
    assert.match(requests[0] ?? "", /^https:\/\/comic-days\.com\/search\?q=/);
    assert.equal(requests.length, 2);
  });

  it("reads numeric chapter evidence from supported official title pages", async () => {
    setRequestUrlMock((options) => {
      if (options.url.includes("viz.com")) {
        return { text: "<li>Chapter 145</li><li>Chapter 146</li><li>Chapter 147</li>" };
      }
      if (options.url.includes("comic-walker.com")) {
        return { text: '{"title":"第71話"}{"title":"第72話"}' };
      }
      if (options.url.includes("championcross.jp")) {
        return { text: "<span>第452話</span><span>第453話</span>" };
      }
      throw new Error(`unexpected URL ${options.url}`);
    });
    const client = new OfficialMangaReleaseClient();
    const viz = await client.latestChapter(
      { id: "viz", label: "VIZ", url: "https://www.viz.com/vizmanga/chapters/frieren-the-journeys-end" },
      [],
    );
    const kadocomi = await client.latestChapter(
      { id: "kadocomi", label: "Kadocomi", url: "https://comic-walker.com/detail/example" },
      [],
    );
    const champion = await client.latestChapter(
      { id: "champion-cross", label: "Champion Cross", url: "https://championcross.jp/series/example" },
      [],
    );
    assert.equal(viz?.latest, "147");
    assert.equal(kadocomi?.latest, "72");
    assert.equal(champion?.latest, "453");
  });

  it("queries one selected NDL catalog at a time and tags records with catalog provenance", async () => {
    const requests: any[] = [];
    const item = node("item", "", [
      node("title", "Re:ゼロから始める異世界生活"),
      node("link", "https://ndlsearch.ndl.go.jp/books/example"),
      node("identifier", "9784040000000"),
      node("seriesTitle", "MF文庫J"),
      node("alternative", "", [node("value", "Re:ゼロから始める異世界生活")]),
      node("volume", "45"),
      node("creator", "長月達平"),
      node("publisher", "KADOKAWA"),
      node("issued", "2026-06-25"),
    ]);
    const fakeDocument = {
      querySelector: () => null,
      getElementsByTagName: (name: string) => name === "item" ? [item] : [],
    };
    Object.defineProperty(globalThis, "DOMParser", {
      configurable: true,
      value: class {
        parseFromString(): Document { return fakeDocument as unknown as Document; }
      },
    });
    setRequestUrlMock((options) => {
      requests.push(options);
      return { text: "<rss />" };
    });

    const client = new NdlReleaseClient();
    const jpro = await client.searchCatalog("jpro-book", "Re:ゼロから始める異世界生活");
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /dpid=jpro-book/);
    assert.doesNotMatch(requests[0].url, /creator=/);
    assert.equal(jpro[0]?.catalog, "jpro-book");
    assert.deepEqual(jpro[0]?.alternativeTitles, ["Re:ゼロから始める異世界生活"]);

    const national = await client.searchCatalog("ndl-national", "Re:ゼロから始める異世界生活");
    assert.equal(requests.length, 2);
    assert.match(requests[1].url, /dpid=iss-ndl-opac-national/);
    assert.equal(national[0]?.catalog, "ndl-national");
    assert.equal(national[0]?.volume, "45");
    assert.equal(national[0]?.publishedAt, "2026-06-25");
  });
});
