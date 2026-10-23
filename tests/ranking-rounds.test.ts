import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MediaItem } from "../src/domain/media-types";
import {
  completedRankingItems, decideRanking, emptyRankingCollection, nextRankingPair,
  prepareRankingRounds, rankingCounts, rankingGridDropPosition,
} from "../src/domain/pairwise-ranking";

function item(n: number): MediaItem {
  return { title: "Work " + n, filePath: "Anime/Work-" + n + ".md",
    mediaType: "anime", status: "completed" } as MediaItem;
}

function finish(list: ReturnType<typeof emptyRankingCollection>, items: MediaItem[], ranking: string[]): number {
  let count = 0;
  while (nextRankingPair(list)) {
    const pair = nextRankingPair(list)!;
    const better = ranking.indexOf(pair.candidate) < ranking.indexOf(pair.reference);
    assert.ok(decideRanking(list, items, better ? "better" : "worse"));
    if (++count > 1000) throw new Error("Round queue did not terminate");
  }
  return count;
}

describe("round-robin complete ranking", () => {
  it("never persists sparse results as null after 3, 5 or 7 completed works", () => {
    for (const size of [3, 5, 7, 8, 11]) {
      const items = Array.from({ length: size }, (_, index) => item(index));
      const list = emptyRankingCollection();
      prepareRankingRounds(list, items, "full");
      let steps = 0;
      while (list.round) {
        const round = list.round;
        const saved = JSON.parse(JSON.stringify(round)) as typeof round;
        assert.equal(saved.results.length, saved.jobs.length);
        assert.ok(saved.results.every((entry) => Array.isArray(entry)),
          "No job may serialize an uninitialized results hole as null");
        assert.deepEqual(saved.results,
          saved.jobs.map((job) => job.done ? job.winners : []));
        const pair = nextRankingPair(list);
        if (!pair) throw new Error("Round has no pair but did not finish");
        assert.ok(decideRanking(list, items, steps % 2 ? "worse" : "better"));
        if (++steps > 200) throw new Error("Round did not terminate");
      }
      assert.equal(list.ordered.length, size);
      assert.equal(new Set(list.ordered).size, size);
    }
  });

  it("interleaves all first-round comparisons before repeating a work", () => {
    const items = Array.from({ length: 8 }, (_, i) => item(i));
    const list = emptyRankingCollection();
    assert.equal(prepareRankingRounds(list, items, "full"), true);
    const names: string[] = [];
    for (let i = 0; i < 4; i++) {
      const pair = nextRankingPair(list)!;
      names.push(pair.candidate, pair.reference);
      decideRanking(list, items, "better");
    }
    assert.equal(new Set(names).size, 8);
    assert.equal(list.round?.stage, 2);
  });

  it("produces an exact total ranking, not only a tournament winner", () => {
    const items = Array.from({ length: 32 }, (_, i) => item(i));
    const expected = [...items].reverse().map((work) => work.filePath);
    const list = emptyRankingCollection();
    prepareRankingRounds(list, completedRankingItems(items, "anime"), "full");
    const comparisons = finish(list, items, expected);
    assert.deepEqual(list.ordered, expected);
    assert.equal(list.round, null);
    assert.deepEqual(list.pending, {});
    assert.ok(comparisons <= 160, "merge sort must use O(n log n) comparisons");
  });

  it("preserves all old rank relations when inserting a batch", () => {
    const items = Array.from({ length: 6 }, (_, i) => item(i));
    const oldRanks = [items[1].filePath, items[3].filePath];
    const target = [items[0], items[1], items[2], items[3], items[4], items[5]].map((x) => x.filePath);
    const list = emptyRankingCollection();
    list.ordered = [...oldRanks];
    prepareRankingRounds(list, items, "append");
    assert.deepEqual(list.ordered, oldRanks, "old ranks stay visible until merge finishes");
    finish(list, items, target);
    assert.deepEqual(list.ordered, target);
  });

  it("reorders only a selected contiguous range", () => {
    const items = Array.from({ length: 6 }, (_, i) => item(i));
    const list = emptyRankingCollection();
    list.ordered = items.map((x) => x.filePath);
    prepareRankingRounds(list, items, "range", 2, 5);
    assert.equal(list.round?.kind, "range");
    assert.deepEqual(list.ordered, items.map((x) => x.filePath));
    const target = [items[0], items[4], items[3], items[2], items[1], items[5]].map((x) => x.filePath);
    finish(list, items, target);
    assert.deepEqual(list.ordered, target);
  });

  it("does not promote a skipped work into a definite rank", () => {
    const items = Array.from({ length: 4 }, (_, i) => item(i));
    const list = emptyRankingCollection();
    prepareRankingRounds(list, items, "full");
    const first = nextRankingPair(list)!;
    decideRanking(list, items, "skip");
    finish(list, items, items.map((x) => x.filePath));
    assert.equal(list.ordered.length, 3);
    assert.equal(list.pending[first.candidate].path, first.candidate);
    assert.equal(new Set(list.ordered).size, 3);
    assert.deepEqual(rankingCounts(list, items), { ranked: 3, pending: 1, unranked: 0 });
  });

  it("retains the current round after a choice without storing snapshots", () => {
    const items = Array.from({ length: 4 }, (_, i) => item(i));
    const list = emptyRankingCollection();
    prepareRankingRounds(list, items, "full");
    const first = nextRankingPair(list);
    assert.ok(first);
    assert.equal(decideRanking(list, items, "worse"), true);
    assert.equal(list.round?.comparisons, 1);
    assert.notDeepEqual(nextRankingPair(list), first);
    assert.equal(Object.hasOwn(list, "history"), false);
  });

  it("assigns correct grid drop positions both downward and upward", () => {
    const rects = [
      { left: 0, top: 0, width: 200, height: 100 },
      { left: 210, top: 0, width: 200, height: 100 },
      { left: 0, top: 110, width: 200, height: 100 },
      { left: 210, top: 110, width: 200, height: 100 },
    ];
    assert.equal(rankingGridDropPosition(rects, 0, 360, 60), 2);
    assert.equal(rankingGridDropPosition(rects, 0, 360, 170), 4);
    assert.equal(rankingGridDropPosition(rects, 3, 30, 45), 1);
  });
});
