import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MediaItem, MediaType } from "../src/domain/media-types";
import {
  completedRankingItems, decideRanking, emptyRankingCollection, emptyRankingState,
  moveRankedItem, nextRankingPair, placePendingItem, prepareRanking,
  rankingBounds, rankingCounts, recompareRankedItem, renameRankingPath, resumePendingRanking,
  undoRanking, reconcileRanking, removeRankingPath,
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
    assert.deepEqual(rankingCounts(list, [a, b]), { ranked: 1, pending: 1, unranked: 0 });
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

  it("undoes a comparison including automatic insertion", () => {
    const a = media("A"), b = media("B");
    const list = emptyRankingCollection();
    list.ordered = [a.filePath];
    list.active = { path: b.filePath, comparisons: {} };
    decideRanking(list, [a,b], "better");
    assert.deepEqual(list.ordered, [b.filePath, a.filePath]);
    assert.equal(undoRanking(list), true);
    assert.deepEqual(list.ordered, [a.filePath]);
    assert.equal(list.active?.path, b.filePath);
    assert.equal(undoRanking(list), false);
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
    assert.equal(removeRankingPath(state, "B"), false);
  });

  it("removes entries no longer completed and never resurrects stale undo references", () => {
    const list = emptyRankingCollection();
    list.ordered = ["anime/A.md", "anime/B.md"];
    list.pending["anime/C.md"] = { path: "anime/C.md", comparisons: { "anime/B.md": "better" } };
    const items = [media("A"), media("B", "anime", "ongoing"), media("C")];
    reconcileRanking(list, completedRankingItems(items, "anime"));
    assert.deepEqual(list.ordered, ["anime/A.md"]);
    assert.deepEqual(list.pending["anime/C.md"].comparisons, {});
  });
});
