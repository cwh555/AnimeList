import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { App } from "obsidian";
import { PairwiseRankingStore } from "../src/data/pairwise-ranking/store";
import { emptyRankingState } from "../src/domain/pairwise-ranking";
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

  it("detects null round arrays without crashing on .map or rewriting stored data", async () => {
    for (const field of ["results", "baseline", "jobs", "left", "right", "winners"]) {
      const { app, adapter } = setup();
      const stored = emptyRankingState();
      const round = startRankingRound(["A", "B"], "full");
      if (field === "left" || field === "right" || field === "winners") {
        (round.jobs[0] as unknown as Record<string, unknown>)[field] = null;
      } else (round as unknown as Record<string, unknown>)[field] = null;
      stored.anime.round = round;
      const original = JSON.stringify(stored);
      const path = ".obsidian/animelist-ranking.json";
      adapter.put(path, original);
      await assert.rejects(new PairwiseRankingStore(app).load(), /Invalid saved ranking round/);
      assert.equal(new TextDecoder().decode(adapter.files.get(path)), original,
        "a malformed round must never be silently erased");
    }
  });

  it("does not replace corrupt ranking state with a blank file", async () => {
    const { app, adapter } = setup();
    adapter.put(".obsidian/animelist-ranking.json", "{not-valid-json");
    await assert.rejects(new PairwiseRankingStore(app).load(), /JSON|Unexpected|Expected/);
    assert.equal(adapter.files.size, 1);
  });
});
