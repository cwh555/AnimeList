import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MediaItem, MediaType } from "../src/domain/media-types";
import {
  completedRankingItems, decideRanking, emptyRankingCollection, emptyRankingState,
  moveRankedItem, nextRankingPair, placePendingItem, prepareRanking,
  rankingBounds, rankingCounts, rankingDropPosition, recompareRankedItem, renameRankingPath, resumePendingRanking,
  reconcileRanking, removeRankingPath, settleUnambiguousPending,
} from "../src/domain/pairwise-ranking";

function media(title: string, type: MediaType = "anime", status: MediaItem["status"] = "completed"): MediaItem {
  return { title, filePath: type + "/" + title + ".md", mediaType: type, status } as MediaItem;
}
function finishComparisons(list: ReturnType<typeof emptyRankingCollection>, items: MediaItem[], ideal: string[]): number {
  let questions = 0;
  for (let i = 0; i < 3000; i++) {
    const pair = nextRankingPair(list);
    if (!pair) break;
    const candidateWins = ideal.indexOf(pair.candidate) < ideal.indexOf(pair.reference);
    assert.equal(decideRanking(list, items, candidateWins ? "better" : "worse"), true);
    questions++;
  }
  return questions;
}

describe("pairwise ranking: strict ordered list", () => {
  it("converts pointer coordinates to ranks after excluding dragged source", () => {
    const bounds = [0, 100, 200, 300].map((top) => ({ top, height: 100 }));
    assert.equal(rankingDropPosition(bounds, 0, 150), 2);
    assert.equal(rankingDropPosition(bounds, 0, 260), 3);
    assert.equal(rankingDropPosition(bounds, 3, 120), 2);
    assert.equal(rankingDropPosition(bounds, 1, -10), 1);
    assert.equal(rankingDropPosition(bounds, 1, 10000), 4);
  });
  it("handles zero completed works and a fully empty ranking without starting comparisons", () => {
    const list = emptyRankingCollection();
    const ongoing = media("A", "anime", "ongoing");
    const eligible = completedRankingItems([ongoing], "anime");
    assert.deepEqual(eligible, []);
    reconcileRanking(list, eligible);
    assert.deepEqual(list.ordered, []);
    assert.deepEqual(rankingCounts(list, eligible), { ranked: 0, pending: 0, unranked: 0 });
    assert.equal(nextRankingPair(list), null);
    prepareRanking(list, eligible, "new");
    assert.equal(nextRankingPair(list), null);
    assert.deepEqual(list.ordered, []);
  });

  it("keeps anime/manga/novels separate and excludes unfinished or dropped works", () => {
    const items = [media("A"), media("B", "manga"), media("C", "novel"), media("D", "anime", "ongoing")];
    assert.deepEqual(completedRankingItems(items, "anime").map((item) => item.title), ["A"]);
    assert.deepEqual(completedRankingItems(items, "manga").map((item) => item.title), ["B"]);
    assert.deepEqual(completedRankingItems(items, "novel").map((item) => item.title), ["C"]);
  });

  it("builds a strict full ranking with logarithmic comparisons per insertion", () => {
    const items = Array.from({ length: 50 }, (_, index) => media(String(index + 1).padStart(3, "0")));
    const eligible = completedRankingItems(items, "anime");
    const ideal = [...items].reverse().map((item) => item.filePath);
    const list = emptyRankingCollection();
    prepareRanking(list, eligible, "new");
    const questions = finishComparisons(list, eligible, ideal);
    assert.deepEqual(list.ordered, ideal);
    assert.equal(list.active, null);
    assert.equal(Object.keys(list.pending).length, 0);
    assert.ok(questions < 300);
    assert.equal(new Set(list.ordered).size, 50);
  });

  it("inserts a newly completed work without reordering old entries", () => {
    const a = media("A"), b = media("B"), c = media("C");
    const list = emptyRankingCollection();
    list.ordered = [a.filePath, c.filePath];
    prepareRanking(list, [a, b, c], "new");
    assert.equal(list.active?.path, b.filePath);
    finishComparisons(list, [a, b, c], [a.filePath, b.filePath, c.filePath]);
    assert.deepEqual(list.ordered, [a.filePath, b.filePath, c.filePath]);
  });

  it("treats skip as unknown, not as a tie, and excludes unresolved items", () => {
    const a = media("A"), b = media("B");
    const list = emptyRankingCollection();
    prepareRanking(list, [a, b], "new");
    assert.ok(nextRankingPair(list));
    decideRanking(list, [a, b], "skip");
    assert.equal(nextRankingPair(list), null);
    assert.equal(list.ordered.length, 1);
    assert.equal(Object.keys(list.pending).length, 1);
    const remaining = Object.values(list.pending)[0];
    assert.deepEqual(rankingBounds(list, remaining), { first: 0, last: 1 });
    assert.deepEqual(rankingCounts(list, [a, b]), { ranked: 0, pending: 2, unranked: 0 });
  });

  it("automatically resolves a pending entry when strict evidence leaves a unique slot", () => {
    const a = media("A"), b = media("B"), c = media("C");
    const list = emptyRankingCollection();
    list.ordered = [a.filePath, b.filePath];
    list.pending[c.filePath] = { path: c.filePath, comparisons: {
      [a.filePath]: "worse", [b.filePath]: "better",
    } };
    assert.equal(settleUnambiguousPending(list), 1);
    assert.deepEqual(list.ordered, [a.filePath, c.filePath, b.filePath]);
    assert.equal(Object.keys(list.pending).length, 0);
    assert.equal(settleUnambiguousPending(list), 0);
  });

  it("retries skipped references while preserving explicit comparisons", () => {
    const a = media("A"), b = media("B"), c = media("C");
    const list = emptyRankingCollection();
    list.ordered = [a.filePath, b.filePath];
    list.pending[c.filePath] = { path: c.filePath, comparisons: { [a.filePath]: "worse", [b.filePath]: "skip" } };
    prepareRanking(list, [a, b, c], "pending");
    assert.equal(list.active?.comparisons[a.filePath], "worse");
    assert.equal(list.active?.comparisons[b.filePath], undefined);
    assert.deepEqual(nextRankingPair(list), { candidate: c.filePath, reference: b.filePath });
    decideRanking(list, [a, b, c], "worse");
    assert.deepEqual(list.ordered, [a.filePath, b.filePath, c.filePath]);
  });

  it("handles three already-pending manga in a single uninterrupted review", () => {
    const items = Array.from({ length: 6 }, (_, index) => media("M" + index, "manga"));
    const list = emptyRankingCollection();
    list.ordered = items.slice(0, 3).map((item) => item.filePath);
    for (const item of items.slice(3)) {
      list.pending[item.filePath] = { path: item.filePath, comparisons: {} };
    }
    // This corresponds to the real UI's "ranked 3, pending 3" state.
    prepareRanking(list, items, "pending");
    assert.deepEqual(list.pendingQueue, [items[4].filePath, items[5].filePath]);
    let comparisons = 0;
    const visited = new Set<string>();
    while (nextRankingPair(list)) {
      const pair = nextRankingPair(list)!;
      visited.add(pair.candidate);
      assert.ok(decideRanking(list, items, "better"));
      if (++comparisons > 50) throw new Error("Pending queue failed to finish");
      if (visited.size < 3) assert.ok(nextRankingPair(list), "the next work must appear without another Start click");
    }
    assert.deepEqual([...visited], items.slice(3).map((item) => item.filePath));
    assert.equal(list.ordered.length, 6);
    assert.deepEqual(list.pending, {});
    assert.equal(list.pendingQueue, null);
    assert.equal(list.active, null);
    assert.ok(comparisons >= 3);
  });

  it("skipped pending works are reviewed once per session, with no infinite repeat", () => {
    const items = Array.from({ length: 5 }, (_, index) => media("M" + index, "manga"));
    const list = emptyRankingCollection();
    list.ordered = items.slice(0, 2).map((item) => item.filePath);
    for (const item of items.slice(2)) {
      list.pending[item.filePath] = { path: item.filePath, comparisons: {} };
    }
    prepareRanking(list, items, "pending");
    const visited = new Set<string>();
    let count = 0;
    while (nextRankingPair(list)) {
      const pair = nextRankingPair(list)!;
      visited.add(pair.candidate);
      assert.ok(decideRanking(list, items, "skip"));
      if (++count > 20) throw new Error("A skipped work was requeued indefinitely");
    }
    assert.deepEqual([...visited], items.slice(2).map((item) => item.filePath));
    assert.equal(list.ordered.length, 2);
    assert.equal(Object.keys(list.pending).length, 3);
    assert.equal(list.pendingQueue, null);
    // Only a new explicit user action should retry unresolved comparisons.
    prepareRanking(list, items, "pending");
    assert.ok(nextRankingPair(list));
  });

  it("persists review progress and resumes after pause without extra state snapshots", () => {
    const items = Array.from({ length: 5 }, (_, index) => media("M" + index, "manga"));
    const original = emptyRankingCollection();
    original.ordered = items.slice(0, 2).map((item) => item.filePath);
    for (const item of items.slice(2)) original.pending[item.filePath] = {
      path: item.filePath, comparisons: {},
    };
    prepareRanking(original, items, "pending");
    assert.equal(original.active?.path, items[2].filePath);
    decideRanking(original, items, "better");
    // Serialized persisted state is the state the modal will load after closing.
    const restored = JSON.parse(JSON.stringify(original)) as typeof original;
    const savedPair = nextRankingPair(restored);
    prepareRanking(restored, items, "pending");
    assert.deepEqual(nextRankingPair(restored), savedPair);
    decideRanking(restored, items, "worse");
    assert.equal(Object.hasOwn(restored, "history"), false);
    let count = 0;
    while (nextRankingPair(restored)) {
      decideRanking(restored, items, "better");
      if (++count > 30) throw new Error("Resumed queue did not complete");
    }
    assert.equal(restored.ordered.length, 5);
    assert.equal(restored.pendingQueue, null);
  });

  it("keeps review queue consistent when queued notes are renamed or removed", () => {
    const items = Array.from({ length: 5 }, (_, index) => media("M" + index, "manga"));
    const state = emptyRankingState();
    const list = state.manga;
    list.ordered = items.slice(0, 2).map((item) => item.filePath);
    for (const item of items.slice(2)) list.pending[item.filePath] = {
      path: item.filePath, comparisons: {},
    };
    prepareRanking(list, items, "pending");
    const renameFrom = items[3].filePath;
    const renamed = "manga/Renamed.md";
    assert.equal(renameRankingPath(state, renameFrom, renamed), true);
    assert.ok(list.pendingQueue?.includes(renamed));
    assert.equal(removeRankingPath(state, items[4].filePath), true);
    assert.equal(list.pendingQueue?.includes(items[4].filePath), false);
    assert.equal(list.pending[renamed]?.path, renamed);
  });

  it("resolves a pending entry as soon as its saved strict bounds become unique", () => {
    const a = media("A"), b = media("B"), x = media("X");
    const list = emptyRankingCollection();
    list.ordered = [a.filePath, b.filePath];
    list.pending[x.filePath] = { path: x.filePath, comparisons: {
      [a.filePath]: "worse", [b.filePath]: "better",
    } };
    assert.equal(resumePendingRanking(list, [a, b, x], x.filePath), true);
    assert.deepEqual(list.ordered, [a.filePath, x.filePath, b.filePath]);
    assert.equal(list.active, null);
  });

  it("uses transitively inferred insertion bounds without asking every reference", () => {
    const a = media("A"), b = media("B"), c = media("C"), x = media("X");
    const list = emptyRankingCollection();
    list.ordered = [a.filePath, b.filePath, c.filePath];
    list.active = { path: x.filePath, comparisons: { [a.filePath]: "worse", [c.filePath]: "better" } };
    const pair = nextRankingPair(list);
    assert.deepEqual(pair, { candidate: x.filePath, reference: b.filePath });
    decideRanking(list, [a,b,c,x], "better");
    assert.deepEqual(list.ordered, [a.filePath, x.filePath, b.filePath, c.filePath]);
  });

  it("records a decision directly without allocating snapshots", () => {
    const a = media("A"), b = media("B");
    const list = emptyRankingCollection();
    list.ordered = [a.filePath];
    list.active = { path: b.filePath, comparisons: {} };
    assert.equal(decideRanking(list, [a,b], "better"), true);
    assert.deepEqual(list.ordered, [b.filePath, a.filePath]);
    assert.equal(list.active, null);
    assert.equal(Object.hasOwn(list, "history"), false);
  });

  it("manual rank moves preserve others' relative order and supersede old evidence", () => {
    const list = emptyRankingCollection();
    list.ordered = ["A", "B", "C", "D"];
    list.pending.E = { path: "E", comparisons: { B: "worse", D: "skip" } };
    assert.equal(moveRankedItem(list, "D", 2), true);
    assert.deepEqual(list.ordered, ["A", "D", "B", "C"]);
    assert.deepEqual(list.pending.E.comparisons, { B: "worse" });
    assert.equal(moveRankedItem(list, "unknown", 1), false);
  });

  it("permits explicit placement of a pending work without rank duplication", () => {
    const list = emptyRankingCollection();
    list.ordered = ["A", "C"];
    list.pending.B = { path: "B", comparisons: { A: "skip" } };
    assert.equal(placePendingItem(list, "B", 2), true);
    assert.deepEqual(list.ordered, ["A", "B", "C"]);
    assert.equal(Object.hasOwn(list.pending, "B"), false);
    assert.equal(placePendingItem(list, "B", 1), false);
  });

  it("recomparison removes just that entry and preserves the others", () => {
    const list = emptyRankingCollection();
    list.ordered = ["A", "B", "C"];
    assert.equal(recompareRankedItem(list, "B"), true);
    assert.deepEqual(list.ordered, ["A", "C"]);
    assert.equal(list.pending.B.path, "B");
  });

  it("renames all ranked, pending, and active references", () => {
    const state = emptyRankingState();
    state.anime.ordered = ["A", "B"];
    state.anime.active = { path: "C", comparisons: { A: "better" } };
    state.anime.pending.D = { path: "D", comparisons: { A: "skip" } };
    assert.equal(renameRankingPath(state, "A", "Renamed"), true);
    assert.deepEqual(state.anime.ordered, ["Renamed", "B"]);
    assert.equal(state.anime.active?.comparisons.Renamed, "better");
    assert.equal(state.anime.pending.D.comparisons.Renamed, "skip");
    assert.equal(renameRankingPath(state, "missing", "something"), false);
  });

  it("deletes a removed note from every ranking relation", () => {
    const state = emptyRankingState();
    state.anime.ordered = ["A", "B"];
    state.anime.active = { path: "C", comparisons: { B: "worse" } };
    state.manga.pending.M = { path: "M", comparisons: { B: "skip" } };
    assert.equal(removeRankingPath(state, "B"), true);
    assert.deepEqual(state.anime.ordered, ["A"]);
    assert.deepEqual(state.anime.active?.comparisons, {});
    assert.deepEqual(state.manga.pending.M.comparisons, {});
    assert.deepEqual(state.novel.ordered, [], "unrelated novel ranking is untouched");
    assert.equal(removeRankingPath(state, "B"), false);
  });

  it("removes entries no longer completed and prunes stale ranking references", () => {
    const list = emptyRankingCollection();
    list.ordered = ["anime/A.md", "anime/B.md"];
    list.pending["anime/C.md"] = { path: "anime/C.md", comparisons: { "anime/B.md": "better" } };
    const items = [media("A"), media("B", "anime", "ongoing"), media("C")];
    reconcileRanking(list, completedRankingItems(items, "anime"));
    assert.deepEqual(list.ordered, ["anime/A.md"]);
    assert.deepEqual(list.pending["anime/C.md"].comparisons, {});
  });
});
