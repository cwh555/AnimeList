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

test("serial cover query uses original title and numeric label only", () => {
  assert.equal(serialCoverQuery("寄宿学校のジュリエット", "5"), "寄宿学校のジュリエット 5");
  assert.equal(serialCoverQuery("寄宿学校のジュリエット", "EX"), null);
});

test("original title selection prefers stored native aliases", () => {
  assert.equal(selectOriginalTitle("", ["Boarding School Juliet", "寄宿学校のジュリエット"]), "寄宿学校のジュリエット");
});

test("cover ranking requires the requested number", () => {
  const ranked = rankSerialCoverCandidates([
    { provider: "x", sourceId: "4", title: "寄宿学校のジュリエット 4", coverUrl: "4.jpg", infoUrl: "" },
    { provider: "x", sourceId: "5", title: "寄宿学校のジュリエット 5", coverUrl: "5.jpg", infoUrl: "" },
  ], "寄宿学校のジュリエット", "5");
  assert.equal(ranked[0]?.sourceId, "5");
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

test("serial cover provider retries 429 and preserves one exact query", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  const urls: string[] = [];
  let attempts = 0;
  setRequestUrlMock(async (options) => {
    urls.push(String(options.url));
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("Request failed with status 429") as Error & { status: number };
      error.status = 429;
      throw error;
    }
    return { json: { items: [{ id: "v5", volumeInfo: { title: "寄宿学校のジュリエット 5", imageLinks: { thumbnail: "http://cover/5.jpg" } } }] } };
  });
  const result = await searchSerialCovers("寄宿学校のジュリエット 5", "寄宿学校のジュリエット", "5", "novel");
  assert.equal(attempts, 2);
  assert.equal(result[0]?.sourceId, "v5");
  for (const url of urls) {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("q"), "寄宿学校のジュリエット 5");
  }
});

test("serial cover provider coalesces duplicate concurrent queries", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  let calls = 0;
  setRequestUrlMock(async () => {
    calls += 1;
    return { json: { items: [] } };
  });
  await Promise.all([
    searchSerialCovers("無職転生 ～異世界行ったら本気だす～ 1", "無職転生 ～異世界行ったら本気だす～", "1", "novel"),
    searchSerialCovers("無職転生 ～異世界行ったら本気だす～ 1", "無職転生 ～異世界行ったら本気だす～", "1", "novel"),
  ]);
  assert.equal(calls, 1);
});


test("serial cover provider includes configured API key without changing the exact query", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProvider({ apiKey: "project-key" });
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  let requested = "";
  setRequestUrlMock(async (options) => {
    requested = String(options.url);
    return { json: { items: [] } };
  });
  await searchSerialCovers("転生したらスライムだった件 1", "転生したらスライムだった件", "1", "novel");
  const url = new URL(requested);
  assert.equal(url.searchParams.get("q"), "転生したらスライムだった件 1");
  assert.equal(url.searchParams.get("key"), "project-key");
  configureSerialCoverProvider({ apiKey: "" });
});

test("serial cover ranking distinguishes light novels from manga with the same title", () => {
  const candidates = [
    { provider: "Google Books", sourceId: "manga", title: "転生したらスライムだった件 1", coverUrl: "manga.jpg", infoUrl: "", categories: ["Comics & Graphic Novels / Manga"] },
    { provider: "Google Books", sourceId: "novel", title: "転生したらスライムだった件 1", coverUrl: "novel.jpg", infoUrl: "", categories: ["Young Adult Fiction / Light Novel"] },
  ];
  assert.equal(rankSerialCoverCandidates(candidates, "転生したらスライムだった件", "1", "novel")[0]?.sourceId, "novel");
  assert.equal(rankSerialCoverCandidates(candidates, "転生したらスライムだった件", "1", "manga")[0]?.sourceId, "manga");
});
