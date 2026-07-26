import assert from "node:assert/strict";
import test from "node:test";
import {
  confidentSerialCover,
  rankSerialCoverCandidates,
  selectOriginalTitle,
  serialCoverQuery,
} from "../src/serial-entry-cover";
import {
  groupMissingSerialCoverRecords,
  missingSerialCoverEntryCount,
} from "../src/serial-cover-migration";
import { setRequestUrlMock } from "./mocks/obsidian";
import {
  clearSerialCoverProviderCache,
  configureSerialCoverProvider,
  configureSerialCoverProviderForTests,
  searchSerialCovers,
} from "../src/serial-cover-provider";

function bangumiSubject(options: {
  id: number;
  title: string;
  platform: string;
  cover?: string;
}): Record<string, unknown> {
  return {
    id: options.id,
    name: options.title,
    platform: options.platform,
    images: { large: options.cover ?? `https://lain.bgm.tv/${options.id}.jpg` },
  };
}

test("serial cover query uses original title and numeric label only", () => {
  assert.equal(serialCoverQuery("寄宿学校のジュリエット", "5"), "寄宿学校のジュリエット 5");
  assert.equal(serialCoverQuery("寄宿学校のジュリエット", "EX"), null);
});

test("original title selection prefers stored native aliases", () => {
  assert.equal(selectOriginalTitle("", ["Boarding School Juliet", "寄宿学校のジュリエット"]), "寄宿学校のジュリエット");
});

test("cover ranking rejects decimal volumes when an integer volume is requested", () => {
  const ranked = rankSerialCoverCandidates([
    { provider: "x", sourceId: "5", title: "六畳間の侵略者!? (5)", coverUrl: "5.jpg", infoUrl: "", mediaTypeHint: "novel" },
    { provider: "x", sourceId: "7.5", title: "六畳間の侵略者!? (7.5) 白銀の姫と青き騎士", coverUrl: "7.5.jpg", infoUrl: "", mediaTypeHint: "novel" },
  ], "六畳間の侵略者！？", "5", "novel");
  assert.deepEqual(ranked.map((candidate) => candidate.sourceId), ["5"]);
  assert.equal(confidentSerialCover(ranked)?.sourceId, "5");
});

test("missing-cover migration groups entries by work and filters nonnumeric labels", () => {
  const works = groupMissingSerialCoverRecords([
    { filePath: "Manga/A.md", title: "A", mediaType: "manga", label: "5" },
    { filePath: "Manga/A.md", title: "A", mediaType: "manga", label: "3" },
    { filePath: "Manga/A.md", title: "A", mediaType: "manga", label: "5" },
    { filePath: "Novel/B.md", title: "B", mediaType: "novel", label: "EX" },
    { filePath: "Novel/B.md", title: "B", mediaType: "novel", label: "2.5" },
  ]);
  assert.deepEqual(works, [
    { filePath: "Manga/A.md", title: "A", mediaType: "manga", labels: ["3", "5"] },
    { filePath: "Novel/B.md", title: "B", mediaType: "novel", labels: ["2.5"] },
  ]);
  assert.equal(missingSerialCoverEntryCount(works), 3);
});

test("Bangumi lookup retries 429 and preserves one exact query", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProvider({ apiKey: "" });
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  const requests: Array<Record<string, unknown>> = [];
  let attempts = 0;
  setRequestUrlMock(async (options) => {
    requests.push(options as Record<string, unknown>);
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("Request failed with status 429") as Error & { status: number };
      error.status = 429;
      throw error;
    }
    return { json: { data: [bangumiSubject({ id: 5, title: "寄宿学校のジュリエット (5)", platform: "小说" })] } };
  });
  const result = await searchSerialCovers("寄宿学校のジュリエット 5", "寄宿学校のジュリエット", "5", "novel");
  assert.equal(attempts, 2);
  assert.equal(result[0]?.sourceId, "5");
  for (const request of requests) {
    assert.equal(request.url, "https://api.bgm.tv/v0/search/subjects?limit=50&offset=0");
    const body = JSON.parse(String(request.body)) as { keyword: string };
    assert.equal(body.keyword, "寄宿学校のジュリエット 5");
  }
});

test("serial cover provider coalesces duplicate concurrent queries", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProvider({ apiKey: "" });
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  let calls = 0;
  setRequestUrlMock(async () => {
    calls += 1;
    return { json: { data: [] } };
  });
  await Promise.all([
    searchSerialCovers("無職転生 ～異世界行ったら本気だす～ 1", "無職転生 ～異世界行ったら本気だす～", "1", "novel"),
    searchSerialCovers("無職転生 ～異世界行ったら本気だす～ 1", "無職転生 ～異世界行ったら本気だす～", "1", "novel"),
  ]);
  assert.equal(calls, 1);
});

test("Bangumi media type removes manga duplicates and spin-offs", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProvider({ apiKey: "" });
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  setRequestUrlMock(async () => ({
    json: {
      data: [
        bangumiSubject({ id: 120888, title: "転生したらスライムだった件 (1)", platform: "小说" }),
        bangumiSubject({ id: 151881, title: "転生したらスライムだった件 (1)", platform: "漫画" }),
        bangumiSubject({ id: 258107, title: "転スラ日記 転生したらスライムだった件 (1)", platform: "漫画" }),
      ],
    },
  }));
  const result = await searchSerialCovers("転生したらスライムだった件 1", "転生したらスライムだった件", "1", "novel");
  assert.deepEqual(result.map((candidate) => candidate.sourceId), ["120888"]);
  assert.equal(confidentSerialCover(result)?.sourceId, "120888");
});

test("Bangumi ranking selects the main light novel instead of a same-number spin-off", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProvider({ apiKey: "" });
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  setRequestUrlMock(async () => ({
    json: {
      data: [
        bangumiSubject({ id: 107684, title: "この素晴らしい世界に祝福を! (1) あぁ、駄女神さま", platform: "小说" }),
        bangumiSubject({ id: 267274, title: "この素晴らしい世界に祝福を!エクストラ あの愚か者にも脚光を! (1)", platform: "小说" }),
        bangumiSubject({ id: 143034, title: "この素晴らしい世界に祝福を! (1)", platform: "漫画" }),
      ],
    },
  }));
  const result = await searchSerialCovers("この素晴らしい世界に祝福を！ 1", "この素晴らしい世界に祝福を！", "1", "novel");
  assert.equal(result[0]?.sourceId, "107684");
  assert.equal(confidentSerialCover(result)?.sourceId, "107684");
});

test("Google Books is an optional fallback and keeps the exact query", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProvider({ apiKey: "project-key" });
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  const requests: Array<Record<string, unknown>> = [];
  setRequestUrlMock(async (options) => {
    requests.push(options as Record<string, unknown>);
    if (String(options.url).includes("api.bgm.tv")) return { json: { data: [] } };
    return { json: { items: [{ id: "google-1", volumeInfo: { title: "転生したらスライムだった件 1", categories: ["Light Novel"], imageLinks: { thumbnail: "http://cover/1.jpg" } } }] } };
  });
  const result = await searchSerialCovers("転生したらスライムだった件 1", "転生したらスライムだった件", "1", "novel");
  assert.equal(result[0]?.sourceId, "google-1");
  const googleRequest = requests.find((request) => String(request.url).includes("googleapis.com"));
  assert.ok(googleRequest);
  const url = new URL(String(googleRequest.url));
  assert.equal(url.searchParams.get("q"), "転生したらスライムだった件 1");
  assert.equal(url.searchParams.get("key"), "project-key");
  configureSerialCoverProvider({ apiKey: "" });
});

test("without a Google key, an empty Bangumi result does not call Google Books", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProvider({ apiKey: "" });
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  const urls: string[] = [];
  setRequestUrlMock(async (options) => {
    urls.push(String(options.url));
    return { json: { data: [] } };
  });
  const result = await searchSerialCovers("不存在的作品 1", "不存在的作品", "1", "novel");
  assert.deepEqual(result, []);
  assert.deepEqual(urls, ["https://api.bgm.tv/v0/search/subjects?limit=50&offset=0"]);
});

test("Bangumi unknown book platform falls back to requested novel type", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProvider({ apiKey: "" });
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  setRequestUrlMock(async () => ({
    json: {
      data: [{
        id: 116027,
        name: "六畳間の侵略者!? (1)",
        platform: "",
        images: { large: "https://cover/rokujouma-1.jpg" },
      }],
    },
  }));
  const result = await searchSerialCovers("六畳間の侵略者！？ 1", "六畳間の侵略者！？", "1", "novel");
  assert.equal(result[0]?.sourceId, "116027");
  assert.equal(result[0]?.mediaTypeHint, "novel");
});

test("Bangumi known media type is preferred before unknown duplicate", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProvider({ apiKey: "" });
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  setRequestUrlMock(async () => ({
    json: {
      data: [
        { id: "unknown", name: "同名作品 (1)", platform: "", images: { large: "https://cover/unknown.jpg" } },
        { id: "manga", name: "同名作品 (1)", platform: "漫画", images: { large: "https://cover/manga.jpg" } },
      ],
    },
  }));
  const result = await searchSerialCovers("同名作品 1", "同名作品", "1", "manga");
  assert.equal(result[0]?.sourceId, "manga");
  assert.equal(result[0]?.mediaTypeHint, "manga");
});


test("serial cover ranking accepts an unnumbered first light-novel volume", () => {
  const ranked = rankSerialCoverCandidates([
    { provider: "Bangumi", sourceId: "manga-1", title: "六畳間の侵略者!? (1)", coverUrl: "manga.jpg", infoUrl: "", mediaTypeHint: "manga" },
    { provider: "Bangumi", sourceId: "novel-1", title: "六畳間の侵略者!?", coverUrl: "novel.jpg", infoUrl: "", mediaTypeHint: "novel", categories: ["小说"] },
  ], "六畳間の侵略者！？", "1", "novel");
  assert.equal(ranked[0]?.sourceId, "novel-1");
  assert.equal(confidentSerialCover(ranked)?.sourceId, "novel-1");
});


test("serial cover ranking prefers an explicitly numbered first volume", () => {
  const ranked = rankSerialCoverCandidates([
    { provider: "Bangumi", sourceId: "series", title: "無職転生 ～異世界行ったら本気だす～", coverUrl: "series.jpg", infoUrl: "", mediaTypeHint: "novel", categories: ["小说"] },
    { provider: "Bangumi", sourceId: "volume-1", title: "無職転生 ～異世界行ったら本気だす～ (1)", coverUrl: "volume-1.jpg", infoUrl: "", mediaTypeHint: "novel", categories: ["小说"] },
  ], "無職転生 ～異世界行ったら本気だす～", "1", "novel");
  assert.equal(ranked[0]?.sourceId, "volume-1");
  assert.equal(confidentSerialCover(ranked)?.sourceId, "volume-1");
});
