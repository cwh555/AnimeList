import assert from "node:assert/strict";
import test from "node:test";
import { expandTimelineEntries } from "../src/ui/timeline-entry-expansion";
import { SerialCoverLoadQueue } from "../src/app/serial-covers/load-queue";
import { SerialCoverDirectApply } from "../src/app/serial-covers/direct-apply";
import {
  resetSerialCoverProviderForTests,
  configureSerialCoverProvider,
  configureSerialCoverProviderForTests,
} from "../src/data/serial-covers/provider";
import { TFile } from "obsidian";
import { BangumiClient } from "../src/data/providers/bangumi-client";
import type { AnimeListFeatureHost } from "../src/app/feature-types";
import { SerialCoverIntent } from "../src/app/serial-covers/intent";
import { findConfiguredSerialCoverCandidates, loadMissingSerialCovers, loadConfidentSerialCover, findSerialCoverCandidates } from "../src/app/serial-covers/serial-cover-service";
import { resolveSerialEntryCoverPaths } from "../src/domain/serial-covers/timeline";
import { normalizeManualSerialCoverQuery } from "../src/domain/serial-covers/ranking";
import { setRequestUrlMock } from "./mocks/obsidian";
import type { ExternalMediaResult, MediaType } from "../src/domain/media-types";
import { searchMetadataCoverCandidates, uniqueSerialCoverSources } from "../src/data/serial-covers/metadata-candidates";

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
  resetSerialCoverProviderForTests();
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
  }, "20", "無職転生", async (type, query, page) => ({ ...await new BangumiClient().searchPage(type, query, page), warnings: [] }));

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


function metadataCover(provider: string, sourceId: string, title: string, mediaType: MediaType = "novel"): ExternalMediaResult {
  return {
    provider, sourceId, title, originalTitle: title, romajiTitle: "",
    mediaType, format: mediaType, total: 0, unit: "volume", year: "",
    genres: [], rawGenres: [], people: [], platforms: [],
    sourceUrl: `https://example.invalid/${provider}/${sourceId}`,
    coverUrl: `https://example.invalid/covers/${provider}/${sourceId}.jpg`,
    summary: "", externalScore: null, releaseStatus: "unknown",
  };
}

test("manual serial cover picker combines enabled metadata providers rather than returning only Bangumi", async () => {
  resetSerialCoverProviderForTests();
  configureSerialCoverProvider({ apiKey: "" });
  const queries: Array<[string, string, number]> = [];
  const metadataSearch = async (type: "manga" | "novel", query: string, page: number) => {
    queries.push([type, query, page]);
    return {
      results: [
        metadataCover("bangumi", "17", "無職転生 20"),
        metadataCover("anilist", "18", "無職転生 20"),
        metadataCover("openlibrary", "19", "無職転生 20"),
      ],
      warnings: [],
      hasMore: false,
    };
  };
  const results = await findSerialCoverCandidates(
    { mediaType: "novel", originalTitle: "無職転生" },
    "20", "無職転生", metadataSearch,
  );
  assert.deepEqual(queries, [["novel", "無職転生 20", 1]]);
  assert.deepEqual(results.map(result => result.provider), ["Bangumi", "AniList", "Open Library"]);
  assert.equal(results.every(result => result.coverUrl.includes(".jpg")), true);
});

test("configured cover lookup respects provider selection and does not contact the old Bangumi-only endpoint", async () => {
  resetSerialCoverProviderForTests();
  configureSerialCoverProvider({ apiKey: "" });
  let rawRequests = 0;
  setRequestUrlMock(async () => {
    rawRequests += 1;
    throw new Error("unconfigured Bangumi request");
  });
  const metadataSearch = async () => ({ results: [], warnings: [], hasMore: false });
  const results = await findSerialCoverCandidates(
    { mediaType: "novel", originalTitle: "無職転生" },
    "20", "無職転生", metadataSearch,
  );
  assert.deepEqual(results, []);
  assert.equal(rawRequests, 0);
});

test("automatic serial lookup rejects a series-level cover when the requested volume is absent", async () => {
  resetSerialCoverProviderForTests();
  configureSerialCoverProvider({ apiKey: "" });
  const metadataSearch = async () => ({
    results: [metadataCover("anilist", "1", "無職転生")],
    warnings: [],
    hasMore: false,
  });
  const context = { mediaType: "novel" as const, originalTitle: "無職転生" };
  assert.deepEqual(await findSerialCoverCandidates(context, "20", undefined, metadataSearch), []);
  const manual = await findSerialCoverCandidates(context, "20", "無職転生", metadataSearch);
  assert.equal(manual[0]?.provider, "AniList");
});

test("metadata source adapter keeps cover variants from different providers and deduplicates repeated IDs", async () => {
  const result = await searchMetadataCoverCandidates(
    async () => ({
      results: [
        metadataCover("bangumi", "12", "作品 2"),
        metadataCover("bangumi", "12", "作品 2"),
        metadataCover("anilist", "12", "作品 2"),
        metadataCover("openlibrary", "13", "作品 2", "anime"),
      ],
      warnings: [], hasMore: false,
    }),
    "novel", "作品 2",
  );
  assert.deepEqual(result.map(item => item.provider), ["Bangumi", "AniList"]);
  assert.deepEqual(uniqueSerialCoverSources([...result, ...result]).map(item => item.provider), ["Bangumi", "AniList"]);
});

test("simultaneous provider IDs do not mark the wrong cover as applying", async () => {
  const action = new SerialCoverDirectApply();
  let resolve!: () => void;
  const pending = new Promise<void>(complete => { resolve = complete; });
  const chosen = { ...candidate("42"), provider: "AniList" };
  const operation = action.run(chosen, async () => {
    await pending;
    return "applied";
  });
  assert.equal(action.activeSourceId, "42");
  assert.equal(action.activeSourceKey, JSON.stringify(["AniList", "42"]));
  assert.notEqual(action.activeSourceKey, JSON.stringify(["Bangumi", "42"]));
  resolve();
  assert.equal(await operation, "applied");
  assert.equal(action.activeSourceKey, null);
});


test("pagination preserves earlier results after an exception and deduplicates across pages", async () => {
  const pages: number[] = [];
  const output = await searchMetadataCoverCandidates(async (_type, _query, page) => {
    pages.push(page);
    if (page === 3) throw new Error("429");
    return { results: [metadataCover("bangumi", "1", "作品 1"), metadataCover("openlibrary", String(page), "作品 2")], warnings: [], hasMore: true };
  }, "novel", "作品");
  assert.deepEqual(pages, [1, 2, 3]);
  assert.deepEqual(output.map(x => [x.provider, x.sourceId]), [["Bangumi","1"], ["Open Library","1"], ["Open Library","2"]]);
  await assert.rejects(() => searchMetadataCoverCandidates(async () => { throw new Error("offline"); }, "novel", "作品"), /offline/);
});

test("automatic result loses authority after manual selection, clear or editor close", async () => {
  const intent = new SerialCoverIntent();
  const covers = new Map<string,string>();
  let complete!: (value: string) => void;
  const pending = new Promise<string>(resolve => { complete = resolve; });
  const ticket = intent.capture("20");
  const other = intent.capture("21");
  const finished = pending.then(value => { if (intent.isCurrent(ticket)) covers.set("20", value); });
  intent.invalidate("20");
  covers.set("20", "manual.jpg");
  complete("automatic.jpg");
  await finished;
  assert.equal(covers.get("20"), "manual.jpg");
  assert.equal(intent.isCurrent(other), true);
  const afterManual = intent.capture("20");
  intent.invalidate("20");
  covers.delete("20");
  assert.equal(intent.isCurrent(afterManual), false);
  assert.equal(covers.has("20"), false);
  intent.close();
  assert.equal(intent.isCurrent(other), false);
});

function recoveryHost(frontmatter: Record<string, unknown>, onDownload?: () => void, onWrite?: () => void) {
  const file = new TFile();
  file.path = "Example.md"; file.basename = "Example";
  const events: string[] = [];
  const host = {
    app: {
      vault: { getRoot: () => ({ children: [file] }) },
      metadataCache: { getFileCache: () => ({ frontmatter }) },
      fileManager: { async processFrontMatter(_file: TFile, update: (fm: Record<string, unknown>) => void) {
        events.push("write"); onWrite?.(); update(frontmatter);
      } },
    },
    getScanFolders: () => [""],
    async searchSerialVolumeCatalog(request: { label: string }) {
      events.push("lookup:" + request.label);
      return { verified: [candidate(request.label)], alternatives: [], warnings: [] };
    },
    async searchExternalPage() { throw new Error("fallback not expected"); },
    async downloadCover(result: ExternalMediaResult) { events.push("download:" + result.sourceId); onDownload?.(); return "covers/" + result.sourceId + ".jpg"; },
    releaseDownloadedCover(path: string) { events.push("release:" + path); },
  } as unknown as AnimeListFeatureHost;
  return { host, events };
}

test("recovery writes fullwidth legacy labels without changing titles, existing covers or unrelated fields", async () => {
  const fm = { media_type: "novel", title: "無職転生", extra: { keep: 42 }, volume_log: [
    { volume: "２０", completed_at: "2026-01-01", custom: true },
    { label: "21", cover: "manual.jpg", coverManual: true },
    { label: "EX", note: "skip" },
  ] };
  const {host,events} = recoveryHost(fm);
  const summary = await loadMissingSerialCovers(host);
  assert.equal(summary.loaded, 1);
  assert.equal(summary.failed, 0);
  assert.deepEqual(fm, { media_type: "novel", title: "無職転生", extra: { keep: 42 }, volume_log: [
    { volume: "２０", completed_at: "2026-01-01", custom: true, cover: "covers/20.jpg", cover_provider: "Bangumi", cover_source_id: "20" },
    { label: "21", cover: "manual.jpg", coverManual: true },
    { label: "EX", note: "skip" },
  ] });
  assert.deepEqual(events, ["lookup:20","download:20","write","release:covers/20.jpg"]);
});

test("cancelling recovery during an in-flight download never writes and releases the asset", async () => {
  const controller = new AbortController();
  const fm = { media_type: "novel", title: "無職転生", volume_log: [{ label: "20" }, { label: "21" }] };
  const {host,events} = recoveryHost(fm, () => controller.abort());
  const result = await loadMissingSerialCovers(host, undefined, controller.signal);
  assert.equal(result.loaded, 0);
  assert.equal(result.skipped, 2);
  assert.deepEqual(fm.volume_log, [{ label: "20" }, { label: "21" }]);
  assert.deepEqual(events, ["lookup:20","download:20","release:covers/20.jpg"]);
});

test("recovery preserves a concurrent manual cover and reports it as skipped", async () => {
  const entry = { label: "20", cover: "" };
  const fm = { media_type: "novel", title: "無職転生", volume_log: [entry] };
  const {host,events} = recoveryHost(fm, () => { entry.cover = "user.jpg"; });
  const result = await loadMissingSerialCovers(host);
  assert.equal(result.loaded, 0);
  assert.equal(result.skipped, 1);
  assert.equal(fm.volume_log[0].cover, "user.jpg");
  assert.equal(events.at(-1), "release:covers/20.jpg");
});

test("failed recovery writes release downloaded assets and report failure", async () => {
  const fm = { media_type: "novel", title: "無職転生", volume_log: [{ label: "20" }] };
  const {host,events} = recoveryHost(fm, undefined, () => { throw new Error("disk write failed"); });
  const result = await loadMissingSerialCovers(host);
  assert.equal(result.failed, 1);
  assert.match(result.details[0].message, /disk write failed/);
  assert.equal(events.at(-1), "release:covers/20.jpg");
  assert.deepEqual(fm.volume_log, [{ label: "20" }]);
});

test("configured automatic lookup refuses ambiguous verified matches; manual keeps provider alternatives", async () => {
  const context = { mediaType: "novel" as const, originalTitle: "無職転生" };
  const host = {
    async searchSerialVolumeCatalog() { return { verified: [candidate("20"), {...candidate("20"), sourceId:"another"}], alternatives: [{ ...candidate("20"), provider:"Open Library" }], warnings: [] }; },
    async searchExternalPage() { throw new Error("offline"); },
    async downloadCover() { throw new Error("ambiguous result must not download"); },
  } as unknown as AnimeListFeatureHost;
  resetSerialCoverProviderForTests(); configureSerialCoverProvider({apiKey:""});
  assert.equal(await loadConfidentSerialCover(host, context, "20"), null);
  const manual = await findConfiguredSerialCoverCandidates(host, context, "20", "無職転生");
  assert.equal(manual.length, 3);
  assert.ok(manual.some(x => x.provider === "Open Library"));
});


test("automatic fallback accepts source-verified explicit book types and rejects requested-only types", async () => {
  const context = {mediaType:"novel" as const, originalTitle:"無職転生"};
  const result = metadataCover("anilist","safe","無職転生 20");
  const host = {
    async searchSerialVolumeCatalog(){return {verified:[],alternatives:[],warnings:[]};},
    async searchSerialVolumePage(){return {results:[{...result,bookMediaTypeEvidence:"novel"},{...result,provider:"openlibrary",sourceId:"unknown"},{...result,provider:"bangumi",sourceId:"wrong",bookMediaTypeEvidence:"manga"}],warnings:[],hasMore:false};},
    async searchExternalPage(){throw new Error("work-level search not expected");},
    async downloadCover(item: ExternalMediaResult){return item.sourceId+".jpg";},
  } as unknown as AnimeListFeatureHost;
  resetSerialCoverProviderForTests();configureSerialCoverProvider({apiKey:""});
  assert.equal((await loadConfidentSerialCover(host,context,"２０"))?.cover,"safe.jpg");
  const manual=await findConfiguredSerialCoverCandidates(host,context,"20","無職転生");
  assert.equal(manual.length,3);
});
