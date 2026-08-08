import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { setRequestUrlMock } from "../mocks/obsidian";
import { MangaDexReleaseClient } from "../../src/data/providers/mangadex-release-client";
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

  it("uses the documented chapter feed ordering and rejects future/non-numeric chapters", async () => {
    let request: any;
    setRequestUrlMock((options) => {
      request = options;
      return {
        json: {
          data: [
            { attributes: { chapter: "242", publishAt: "2026-08-01T00:00:00Z" } },
            { attributes: { chapter: "243", publishAt: "2026-09-01T00:00:00Z" } },
            { attributes: { chapter: "241.5", publishAt: "2026-07-20T00:00:00Z" } },
            { attributes: { chapter: "Extra", publishAt: "2026-07-25T00:00:00Z" } },
          ],
        },
        text: "",
      };
    });

    const latest = await new MangaDexReleaseClient().latestChapter(
      "series-1",
      new Date("2026-08-08T12:00:00Z"),
    );
    assert.equal(latest, "242");
    assert.match(request.url, /limit=100/);
    assert.match(request.url, /order%5Bchapter%5D=desc/);
    assert.doesNotMatch(request.url, /includeFutureUpdates/);
  });

  it("queries only JPRO printed-book records and parses publication-line fields", async () => {
    let request: any;
    const item = node("item", "", [
      node("title", "Re:ゼロから始める異世界生活"),
      node("link", "https://ndlsearch.ndl.go.jp/books/example"),
      node("identifier", "9784040000000"),
      node("seriesTitle", "Re:ゼロから始める異世界生活"),
      node("volume", "45"),
      node("creator", "長月達平"),
      node("publisher", "KADOKAWA"),
      node("date", "2026-08-08"),
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
      request = options;
      return { text: "<rss />" };
    });

    const records = await new NdlReleaseClient().search("Re:ゼロから始める異世界生活", "長月達平");
    assert.match(request.url, /^https:\/\/ndlsearch\.ndl\.go\.jp\/api\/opensearch\?/);
    assert.match(request.url, /dpid=jpro-book/);
    assert.match(request.url, /mediatype=books/);
    assert.match(request.url, /cnt=200/);
    assert.match(request.url, /creator=/);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.volume, "45");
    assert.equal(records[0]?.publisher, "KADOKAWA");
    assert.equal(records[0]?.publishedAt, "2026-06-25");
    assert.equal(records[0]?.isbn, "9784040000000");
  });
});
