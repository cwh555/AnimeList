import assert from "node:assert/strict";
import { USER_AGENT } from "../src/app-metadata";
import test from "node:test";
import {
  confidentSerialCover,
  manualSerialCoverQueries,
  rankManualSerialCoverCandidates,
  rankSerialCoverCandidates,
  selectOriginalTitle,
  serialCoverQueries,
  serialCoverQuery,
} from "../src/domain/serial-covers/ranking";
import {
  groupMissingSerialCoverRecords,
  missingSerialCoverEntryCount,
} from "../src/domain/serial-covers/migration";
import { setRequestUrlMock } from "./mocks/obsidian";
import { directlyApplySerialCover, SerialCoverDirectApply } from "../src/app/serial-covers/direct-apply";
import {
  clearSerialCoverProviderCache,
  configureSerialCoverProvider,
  configureSerialCoverProviderForTests,
  searchManualSerialCovers,
  searchSerialCovers,
} from "../src/data/serial-covers/provider";

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



test("serial cover query adds a safe Bangumi short-title fallback", () => {
  assert.deepEqual(
    serialCoverQueries("無職転生 ～異世界行ったら本気だす～", "14"),
    ["無職転生 ~異世界行ったら本気だす~ 14", "無職転生 14"],
  );
  assert.deepEqual(serialCoverQueries("寄宿学校のジュリエット", "5"), ["寄宿学校のジュリエット 5"]);
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
    assert.equal((request.headers as Record<string, string> | undefined)?.["User-Agent"], USER_AGENT);
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
  assert.equal(calls, 2);
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


test("Bangumi retries a shortened series query when the exact long title misses a high volume", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProvider({ apiKey: "" });
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  const keywords: string[] = [];
  setRequestUrlMock(async (options) => {
    const body = JSON.parse(String(options.body)) as { keyword: string };
    keywords.push(body.keyword);
    if (body.keyword === "無職転生 ～異世界行ったら本気だす～ 14") {
      return { json: { data: [
        bangumiSubject({ id: 101114, title: "無職転生 ～異世界行ったら本気だす～", platform: "小说" }),
        bangumiSubject({ id: 100704, title: "無職転生 ~異世界行ったら本気だす~ (1)", platform: "小说" }),
      ] } };
    }
    return { json: { data: [
      bangumiSubject({ id: 223981, title: "無職転生 ~異世界行ったら本気だす~ (14)", platform: "小说" }),
      bangumiSubject({ id: 321204, title: "無職転生 ~異世界行ったら本気だす~ (14)", platform: "漫画" }),
    ] } };
  });
  const result = await searchSerialCovers(
    "無職転生 ～異世界行ったら本気だす～ 14",
    "無職転生 ～異世界行ったら本気だす～",
    "14",
    "novel",
  );
  assert.deepEqual(keywords, ["無職転生 ～異世界行ったら本気だす～ 14", "無職転生 14"]);
  assert.equal(result[0]?.sourceId, "223981");
  assert.equal(confidentSerialCover(result)?.sourceId, "223981");
});

test("Mushoku Tensei high-volume novel titles remain confident", () => {
  for (const label of ["14", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26"]) {
    const ranked = rankSerialCoverCandidates([
      { provider: "Bangumi", sourceId: `novel-${label}`, title: `無職転生 ~異世界行ったら本気だす~ (${label})`, coverUrl: `${label}.jpg`, infoUrl: "", mediaTypeHint: "novel", categories: ["小说"] },
      { provider: "Bangumi", sourceId: `manga-${label}`, title: `無職転生 ~異世界行ったら本気だす~ (${label})`, coverUrl: `manga-${label}.jpg`, infoUrl: "", mediaTypeHint: "manga", categories: ["漫画"] },
    ], "無職転生 ～異世界行ったら本気だす～", label, "novel");
    assert.equal(confidentSerialCover(ranked)?.sourceId, `novel-${label}`);
  }
});

test("manual cover discovery includes broad Chinese queries without replacing the exact query", () => {
  assert.deepEqual(manualSerialCoverQueries("關於我被隔壁天使變成廢材這件事", "1").slice(0, 3), [
    "關於我被隔壁天使變成廢材這件事 1",
    "隔壁天使 1",
    "變成废材 1",
  ]);
  assert.ok(manualSerialCoverQueries("不時以俄語遮羞的艾利同學", "1").includes("俄语遮羞 1"));
  assert.deepEqual(manualSerialCoverQueries("冰菓", "1"), ["冰菓 1"]);
});

test("manual ranking retains candidates that automatic confidence filtering rejects", () => {
  const candidates = [
    { provider: "Bangumi", sourceId: "translated", title: "邻座的天使同学 第1卷", coverUrl: "translated.jpg", infoUrl: "", mediaTypeHint: "novel" as const },
    { provider: "Bangumi", sourceId: "manga", title: "隔壁天使 漫画 1", coverUrl: "manga.jpg", infoUrl: "", mediaTypeHint: "manga" as const },
  ];
  assert.deepEqual(rankSerialCoverCandidates(candidates, "關於我被隔壁天使變成廢材這件事", "1", "novel"), []);
  assert.deepEqual(
    rankManualSerialCoverCandidates(
      candidates,
      "關於我被隔壁天使變成廢材這件事",
      "1",
      "novel",
      "お隣の天使様にいつの間にか駄目人間にされていた件",
    ).map((candidate) => candidate.sourceId),
    ["translated", "manga"],
  );
});


test("manual ranking prioritizes the stored original title without filtering broad results", () => {
  const candidates = [
    { provider: "Bangumi", sourceId: "noise", title: "隔壁的冬歌同學只在意我 (1)", coverUrl: "noise.jpg", infoUrl: "", mediaTypeHint: "novel" as const },
    { provider: "Bangumi", sourceId: "correct", title: "お隣の天使様にいつの間にか駄目人間にされていた件", coverUrl: "correct.jpg", infoUrl: "", mediaTypeHint: "novel" as const },
  ];
  const ranked = rankManualSerialCoverCandidates(
    candidates,
    "關於我被隔壁天使變成廢材這件事",
    "1",
    "novel",
    "お隣の天使様にいつの間にか駄目人間にされていた件",
  );
  assert.deepEqual(ranked.map((candidate) => candidate.sourceId), ["correct", "noise"]);
  assert.equal(ranked.length, 2);
});

test("manual provider keeps broad results instead of requiring automatic confidence", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProvider({ apiKey: "" });
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  setRequestUrlMock(async () => ({
    json: { data: [bangumiSubject({ id: 700, title: "完全不同的譯名 (1)", platform: "小说" })] },
  }));
  const manual = await searchManualSerialCovers(
    "隔壁天使 1",
    "隔壁天使",
    "お隣の天使様にいつの間にか駄目人間にされていた件",
    "1",
    "novel",
  );
  assert.equal(manual[0]?.sourceId, "700");
});

test("direct card activation applies once and closes immediately", async () => {
  const candidate = { provider: "Bangumi", sourceId: "14", title: "無職転生 (14)", coverUrl: "14.jpg", infoUrl: "", score: 200 };
  const action = new SerialCoverDirectApply();
  const events: string[] = [];
  const result = await directlyApplySerialCover(
    action,
    candidate,
    async (selected) => {
      events.push(`load:${selected.sourceId}`);
      return "saved-cover";
    },
    (cover) => events.push(`apply:${cover}`),
    () => events.push("close"),
  );
  assert.equal(result, true);
  assert.deepEqual(events, ["load:14", "apply:saved-cover", "close"]);
  assert.equal(action.isApplying, false);
});

test("direct card activation stays open after a download error and permits retry", async () => {
  const candidate = { provider: "Bangumi", sourceId: "14", title: "無職転生 (14)", coverUrl: "14.jpg", infoUrl: "", score: 200 };
  const action = new SerialCoverDirectApply();
  let closed = false;
  await assert.rejects(directlyApplySerialCover(
    action,
    candidate,
    async () => { throw new Error("download failed"); },
    () => undefined,
    () => { closed = true; },
  ), /download failed/);
  assert.equal(closed, false);
  assert.equal(action.isApplying, false);
});
