import assert from "node:assert/strict";
import test from "node:test";
import { expandTimelineEntries } from "../src/novel-progress";
import { SerialCoverLoadQueue } from "../src/serial-cover-load-queue";
import {
  clearSerialCoverProviderCache,
  configureSerialCoverProvider,
  configureSerialCoverProviderForTests,
} from "../src/serial-cover-provider";
import { findSerialCoverCandidates } from "../src/serial-cover-service";
import { resolveSerialEntryCoverPaths } from "../src/serial-cover-timeline";
import { normalizeManualSerialCoverQuery } from "../src/serial-entry-cover";
import { setRequestUrlMock } from "./mocks/obsidian";

function candidate(sourceId: string, score = 200) {
  return {
    provider: "Bangumi",
    sourceId,
    title: `無職転生 (${sourceId})`,
    coverUrl: `${sourceId}.jpg`,
    infoUrl: "",
    score,
  };
}

test("manual cover search accepts a title with or without the current volume suffix", () => {
  assert.deepEqual(normalizeManualSerialCoverQuery("無職転生", "20"), {
    query: "無職転生 20",
    title: "無職転生",
  });
  assert.deepEqual(normalizeManualSerialCoverQuery("無職転生 (20)", "20"), {
    query: "無職転生 20",
    title: "無職転生",
  });
});

test("manual cover search ranks against the edited title instead of the stored long title", async () => {
  clearSerialCoverProviderCache();
  configureSerialCoverProvider({ apiKey: "" });
  configureSerialCoverProviderForTests({ sleep: async () => undefined, random: () => 0 });
  const keywords: string[] = [];
  setRequestUrlMock(async (options) => {
    const body = JSON.parse(String(options.body)) as { keyword: string };
    keywords.push(body.keyword);
    return {
      json: {
        data: [{
          id: 267778,
          name: "無職転生 ~異世界行ったら本気だす~ (20)",
          platform: "小说",
          images: { large: "https://cover/20.jpg" },
        }],
      },
    };
  });

  const results = await findSerialCoverCandidates({
    mediaType: "novel",
    originalTitle: "無職転生 ～異世界行ったら本気だす～",
  }, "20", "無職転生");

  assert.equal(keywords[0], "無職転生 20");
  assert.equal(results[0]?.sourceId, "267778");
});

test("rapid serial additions are processed in insertion order without skipping after failure", async () => {
  const queue = new SerialCoverLoadQueue();
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

  const first = queue.enqueue("14", async () => {
    events.push("14:start");
    await firstGate;
    events.push("14:end");
    return "14";
  });
  const second = queue.enqueue("15", async () => {
    events.push("15:start");
    throw new Error("temporary provider failure");
  });
  const third = queue.enqueue("16", async () => {
    events.push("16:start");
    events.push("16:end");
    return "16";
  });

  await Promise.resolve();
  assert.deepEqual(events, ["14:start"]);
  releaseFirst();
  const settled = await Promise.allSettled([first, second, third]);
  await queue.whenIdle();

  assert.deepEqual(events, ["14:start", "14:end", "15:start", "16:start", "16:end"]);
  assert.equal(settled[0]?.status, "fulfilled");
  assert.equal(settled[1]?.status, "rejected");
  assert.equal(settled[2]?.status, "fulfilled");
  assert.equal(queue.pendingCount, 0);
});

test("duplicate pending serial lookups are coalesced", async () => {
  const queue = new SerialCoverLoadQueue();
  let calls = 0;
  const first = queue.enqueue("20", async () => {
    calls += 1;
    return "cover-20";
  });
  const second = queue.enqueue("20", async () => {
    calls += 1;
    return "duplicate";
  });
  assert.equal(first, second);
  assert.equal(await second, "cover-20");
  assert.equal(calls, 1);
});

test("timeline uses resolved serial-entry covers and falls back to the series cover", () => {
  const volumeLog = resolveSerialEntryCoverPaths([
    {
      label: "14",
      startedAt: "",
      completedAt: "2026-07-14",
      cover: "AnimeList/Covers/Novel/mushoku-14.jpg",
      coverProvider: "Bangumi",
    },
    {
      label: "15",
      startedAt: "",
      completedAt: "2026-07-15",
      cover: "missing.jpg",
    },
  ], (cover) => cover.includes("mushoku-14") ? "app://vault/mushoku-14.jpg" : "");

  assert.equal(volumeLog[0]?.cover, "app://vault/mushoku-14.jpg");
  assert.equal(volumeLog[0]?.coverProvider, "Bangumi");
  assert.equal(volumeLog[1]?.cover, undefined);

  const timeline = expandTimelineEntries([{
    title: "無職轉生",
    originalTitle: "無職転生",
    mediaType: "novel",
    format: "light_novel",
    status: "ongoing",
    releaseStatus: "releasing",
    progress: 15,
    total: 0,
    unit: "volume",
    score: null,
    favorite: false,
    year: 2026,
    genres: [],
    people: [],
    platforms: [],
    sourceUrls: [],
    cover: "app://vault/mushoku-series.jpg",
    filePath: "AnimeList/Novel/無職轉生.md",
    updated: 0,
    updatedLabel: "",
    startedAt: "",
    completedAt: "",
    volumeLog,
  }]);

  assert.equal(timeline[0]?.cover, "app://vault/mushoku-14.jpg");
  assert.equal(timeline[1]?.cover, "app://vault/mushoku-series.jpg");
});
