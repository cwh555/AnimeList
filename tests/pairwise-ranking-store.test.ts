import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { App } from "obsidian";
import { PairwiseRankingStore } from "../src/data/pairwise-ranking/store";
import { decideRanking, emptyRankingState, nextRankingPair } from "../src/domain/pairwise-ranking";
import type { MediaItem } from "../src/domain/media-types";
import { startRankingRound } from "../src/domain/ranking-rounds";

class FakeAdapter {
  files = new Map<string, ArrayBuffer>();
  failure = false;
  async exists(path: string): Promise<boolean> { return this.files.has(path) || path === ".obsidian"; }
  async mkdir(): Promise<void> { /* already configured */ }
  async readBinary(path: string): Promise<ArrayBuffer> {
    const value = this.files.get(path);
    if (!value) throw new Error("missing");
    return value;
  }
  async writeBinary(path: string, value: ArrayBuffer): Promise<void> {
    if (this.failure) throw new Error("disk full");
    this.files.set(path, value);
  }
  put(path: string, contents: string): void { this.files.set(path, new TextEncoder().encode(contents).buffer); }
}
function setup(): { app: App; adapter: FakeAdapter } {
  const adapter = new FakeAdapter();
  const app = { vault: { adapter, configDir: ".obsidian" } } as unknown as App;
  return { app, adapter };
}

describe("ranking vault storage", () => {
  it("persists independent ranking JSON without writing Markdown/frontmatter", async () => {
    const { app, adapter } = setup();
    const service = new PairwiseRankingStore(app);
    await service.mutate((state) => { state.anime.ordered = ["Anime/A.md"]; });
    assert.equal(adapter.files.size, 1);
    const data = new PairwiseRankingStore(app);
    const state = await data.load();
    assert.deepEqual(state.anime.ordered, ["Anime/A.md"]);
    assert.deepEqual(state.manga.ordered, []);
  });
  it("rejects concurrently modified storage instead of silently overwriting it", async () => {
    const { app, adapter } = setup();
    const service = new PairwiseRankingStore(app);
    await service.mutate((state) => { state.anime.ordered = ["A"]; });
    const path = [...adapter.files.keys()][0];
    adapter.put(path, '{"version":1,"changedElsewhere":true}');
    await assert.rejects(service.mutate((state) => { state.anime.ordered = ["A", "B"]; }), /another device/);
    assert.deepEqual((await service.load()).anime.ordered, ["A"]);
  });
  it("retains last saved state when a write fails", async () => {
    const { app, adapter } = setup();
    const service = new PairwiseRankingStore(app);
    await service.mutate((state) => { state.novel.ordered = ["N1"]; });
    adapter.failure = true;
    await assert.rejects(service.mutate((state) => { state.novel.ordered.push("N2"); }), /disk full/);
    assert.deepEqual((await service.load()).novel.ordered, ["N1"]);
  });
  it("supports old v1 collections without a round field", async () => {
    const { app, adapter } = setup();
    const old = emptyRankingState();
    for (const type of ["anime", "manga", "novel"] as const) delete (old[type] as { round?: unknown }).round;
    adapter.put(".obsidian/animelist-ranking.json", JSON.stringify(old));
    const loaded = await new PairwiseRankingStore(app).load();
    assert.deepEqual(loaded.anime.ordered, []);
    assert.equal(loaded.anime.round, undefined);
  });

  it("loads valid partial round queues without dropping comparisons", async () => {
    const { app, adapter } = setup();
    const original = emptyRankingState();
    original.anime.round = startRankingRound(["A", "B", "C", "D"], "full");
    const raw = JSON.stringify(original);
    adapter.put(".obsidian/animelist-ranking.json", raw);
    const result = await new PairwiseRankingStore(app).load();
    assert.deepEqual(result.anime.round?.jobs, original.anime.round.jobs);
    assert.equal(new TextDecoder().decode(adapter.files.get(".obsidian/animelist-ranking.json")), raw);
  });

  it("recovers legacy sparse JSON [null, winners] and resumes across real store restarts", async () => {
    const { app, adapter } = setup();
    const items = ["manga/M1.md", "manga/M2.md", "manga/M3.md",
      "manga/M4.md", "manga/M5.md"];
    const path = ".obsidian/animelist-ranking.json";
    const saved = emptyRankingState();
    saved.anime.ordered = ["anime/existing.md"];
    const round = startRankingRound(items, "full");
    assert.equal(round.jobs.length, 3);
    // Older code created results holes, serialized as JSON nulls on pause.
    const legacy = JSON.parse(JSON.stringify(round)) as Record<string, unknown>;
    legacy.results = [null, null, [items[4]]];
    (saved.manga as { round?: unknown }).round = legacy;
    const original = JSON.stringify(saved);
    adapter.put(path, original);

    let service = new PairwiseRankingStore(app);
    let resumed = await service.load();
    assert.deepEqual(resumed.manga.round?.results, [[], [], [items[4]]]);
    assert.deepEqual(resumed.anime.ordered, ["anime/existing.md"]);
    const backup = service.getRecoveryInfo()?.backupPath;
    assert.ok(backup);
    assert.equal(new TextDecoder().decode(adapter.files.get(backup)), original);
    // Simulate choosing a cover, then closing the Obsidian X and restarting.
    // The modal's close must never be required to repair results.
    let comparisons = 0;
    while (resumed.manga.round) {
      const work = items.map((filePath) => ({ filePath, title: filePath,
        mediaType: "manga", status: "completed" })) as MediaItem[];
      const pair = nextRankingPair(resumed.manga);
      assert.ok(pair);
      await service.mutate((state) => {
        decideRanking(state.manga, work, "better");
      });
      // Reload the adapter after EACH answer, as if X and a plugin restart occurred.
      service = new PairwiseRankingStore(app);
      resumed = await service.load();
      assert.ok(!resumed.manga.round || resumed.manga.round.results.every(Array.isArray));
      if (++comparisons > 100) throw new Error("Resume made no progress");
    }
    assert.equal(resumed.manga.ordered.length, items.length);
    assert.deepEqual(resumed.anime.ordered, ["anime/existing.md"]);
    assert.equal(adapter.files.size, 2, "only one backup should be created");
  });

  it("recovers manga.results = null while preserving other types and exact round order", async () => {
    const { app, adapter } = setup();
    const path = ".obsidian/animelist-ranking.json";
    const stored = emptyRankingState();
    stored.anime.ordered = ["anime/A.md", "anime/B.md"];
    stored.novel.ordered = ["novel/N.md"];
    stored.manga.round = startRankingRound(["M1", "M2", "M3", "M4"], "full");
    // A finished job's winners must survive in a null-results reconstruction.
    stored.manga.round.jobs[0].left = [];
    stored.manga.round.jobs[0].right = [];
    stored.manga.round.jobs[0].winners = ["M2", "M1"];
    stored.manga.round.jobs[0].done = true;
    (stored.manga.round as unknown as Record<string, unknown>).results = null;
    const original = JSON.stringify(stored);
    adapter.put(path, original);
    const service = new PairwiseRankingStore(app);
    const loaded = await service.load();
    assert.deepEqual(loaded.anime.ordered, ["anime/A.md", "anime/B.md"]);
    assert.deepEqual(loaded.novel.ordered, ["novel/N.md"]);
    assert.deepEqual(loaded.manga.round?.results, [["M2", "M1"], []]);
    assert.deepEqual(loaded.manga.round?.jobs[0].winners, ["M2", "M1"]);
    assert.deepEqual(service.getRecoveryInfo()?.types, ["manga"]);
    assert.deepEqual(service.getRecoveryInfo()?.incompleteTypes, []);
    const backup = service.getRecoveryInfo()?.backupPath;
    assert.ok(backup?.startsWith(".obsidian/animelist-ranking.recovery-"));
    assert.equal(new TextDecoder().decode(adapter.files.get(backup)), original);
    assert.equal(new TextDecoder().decode(adapter.files.get(path)), original,
      "opening ranking cannot rewrite original source");
    // Edit a different media type; this must persist the restored manga round too.
    await service.mutate((data) => data.anime.ordered.push("anime/C.md"));
    const reopened = await new PairwiseRankingStore(app).load();
    assert.deepEqual(reopened.anime.ordered, ["anime/A.md", "anime/B.md", "anime/C.md"]);
    assert.deepEqual(reopened.novel.ordered, ["novel/N.md"]);
    assert.deepEqual(reopened.manga.round?.results, [["M2", "M1"], []]);
    assert.equal(reopened.manga.round?.jobs[0].winners[0], "M2");
  });

  it("recovers the same malformed file repeatedly without accumulating backup files", async () => {
    const { app, adapter } = setup();
    const stored = emptyRankingState();
    stored.manga.round = startRankingRound(["M1", "M2"], "full");
    (stored.manga.round as unknown as Record<string, unknown>).results = null;
    adapter.put(".obsidian/animelist-ranking.json", JSON.stringify(stored));
    await new PairwiseRankingStore(app).load();
    await new PairwiseRankingStore(app).load();
    await new PairwiseRankingStore(app).load();
    assert.equal(adapter.files.size, 2, "original and one stable backup only");
  });

  it("quarantines unrecoverable round fields per type instead of blocking the entire ranking", async () => {
    for (const field of ["baseline", "jobs", "left", "right", "winners"]) {
      const { app, adapter } = setup();
      const path = ".obsidian/animelist-ranking.json";
      const stored = emptyRankingState();
      stored.anime.ordered = ["anime/A"];
      stored.novel.ordered = ["novel/N"];
      stored.manga.ordered = ["manga/confirmed"];
      stored.manga.round = startRankingRound(["manga/X", "manga/Y"], "append", ["manga/confirmed"]);
      if (field === "left" || field === "right" || field === "winners") {
        (stored.manga.round.jobs[0] as unknown as Record<string, unknown>)[field] = null;
      } else (stored.manga.round as unknown as Record<string, unknown>)[field] = null;
      adapter.put(path, JSON.stringify(stored));
      const service = new PairwiseRankingStore(app);
      const recovered = await service.load();
      assert.equal(recovered.manga.round, null, field);
      assert.deepEqual(recovered.manga.ordered, ["manga/confirmed"]);
      assert.deepEqual(recovered.anime.ordered, ["anime/A"]);
      assert.deepEqual(recovered.novel.ordered, ["novel/N"]);
      assert.ok(service.getRecoveryInfo()?.incompleteTypes.includes("manga"));
      const pending = new Set(Object.keys(recovered.manga.pending));
      assert.ok(pending.size > 0, field);
      assert.ok(!pending.has("manga/confirmed"));
      assert.equal(adapter.files.size, 2);
      await service.mutate((data) => data.anime.ordered.push("anime/B"));
      const reread = await new PairwiseRankingStore(app).load();
      assert.equal(reread.manga.round, null);
      assert.deepEqual(reread.anime.ordered, ["anime/A", "anime/B"]);
    }
  });

  it("does not change source or fabricate an empty ranking if backup fails", async () => {
    const { app, adapter } = setup();
    const stored = emptyRankingState();
    stored.manga.round = startRankingRound(["M1", "M2"], "full");
    (stored.manga.round as unknown as Record<string, unknown>).results = null;
    const path = ".obsidian/animelist-ranking.json";
    const original = JSON.stringify(stored);
    adapter.put(path, original);
    adapter.failure = true;
    await assert.rejects(new PairwiseRankingStore(app).load(), /disk full/);
    assert.equal(adapter.files.size, 1);
    assert.equal(new TextDecoder().decode(adapter.files.get(path)), original);
  });

  it("copies the exact original UTF-8 bytes including BOM into recovery backup", async () => {
    const { app, adapter } = setup();
    const state = emptyRankingState();
    state.manga.round = startRankingRound(["M1", "M2"], "full");
    (state.manga.round as unknown as Record<string, unknown>).results = null;
    const encoded = new TextEncoder().encode(JSON.stringify(state));
    const bytes = new Uint8Array(encoded.length + 3);
    bytes.set([0xef, 0xbb, 0xbf]);
    bytes.set(encoded, 3);
    const original = bytes.buffer;
    adapter.files.set(".obsidian/animelist-ranking.json", original);
    const service = new PairwiseRankingStore(app);
    const restored = await service.load();
    assert.ok(restored.manga.round);
    const backup = service.getRecoveryInfo()?.backupPath;
    assert.ok(backup);
    assert.deepEqual(new Uint8Array(adapter.files.get(backup)), new Uint8Array(original));
    assert.deepEqual(new Uint8Array(adapter.files.get(".obsidian/animelist-ranking.json")), new Uint8Array(original));
  });

  it("does not replace corrupt ranking state with a blank file", async () => {
    const { app, adapter } = setup();
    adapter.put(".obsidian/animelist-ranking.json", "{not-valid-json");
    await assert.rejects(new PairwiseRankingStore(app).load(), /JSON|Unexpected|Expected/);
    assert.equal(adapter.files.size, 1);
  });
});
