import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MediaItem } from "../src/domain/media-types";
import {
  certifyRankingOrder, legacyRankingEvidence, provesBefore, recordRankingEvidence,
} from "../src/domain/ranking-evidence";
import { diverseRankingOrder, rankingSeriesKey } from "../src/domain/ranking-scheduler";
import {
  completedRankingItems, decideRanking, emptyRankingCollection, nextRankingPair,
  prepareRankingRounds, rankingCounts, rankingUnresolvedPaths,
} from "../src/domain/pairwise-ranking";

const item = (name: string): MediaItem => ({
  title: name, originalTitle: "", mediaType: "anime", status: "completed",
  filePath: "anime/" + name + ".md",
} as MediaItem);

describe("ranking evidence and diverse comparison schedule", () => {
  it("requires reachable strict comparisons, not guessed similarity or scores", () => {
    const evidence = {};
    recordRankingEvidence(evidence, "A", "B");
    recordRankingEvidence(evidence, "B", "C");
    assert.equal(provesBefore(evidence, "A", "C"), true);
    assert.equal(provesBefore(evidence, "C", "A"), false);
    assert.throws(() => recordRankingEvidence(evidence, "C", "A"), /Conflicting/);
    assert.deepEqual(certifyRankingOrder(["A", "B", "C"], evidence),
      { ordered: ["A", "B", "C"], pending: [] });
    assert.deepEqual(certifyRankingOrder(["A", "unknown", "B", "C"], evidence),
      { ordered: ["A", "B", "C"], pending: ["unknown"] });
    assert.equal(Object.keys(legacyRankingEvidence(["A", "B", "C"])).length, 2);
  });
  it("detects explicit season and film variants without matching unrelated works", () => {
    assert.equal(rankingSeriesKey(item("輝夜大小姐想讓我告白 第二季")),
      rankingSeriesKey(item("輝夜大小姐想讓我告白 劇場版")));
    assert.equal(rankingSeriesKey(item("Attack on Titan Season 2")),
      rankingSeriesKey(item("Attack on Titan The Movie")));
    assert.notEqual(rankingSeriesKey(item("Love Is War")), rankingSeriesKey(item("Love Is Magic")));
  });
  it("does not repeat first-stage matchings before the round-robin cycle repeats", () => {
    const items = Array.from({ length: 8 }, (_, index) => item("Work-" + index));
    const seen = new Set<string>();
    for (let generation = 0; generation < 7; generation += 1) {
      const order = diverseRankingOrder(items, generation);
      assert.equal(new Set(order).size, items.length);
      for (let index = 0; index < order.length; index += 2) {
        const pair = [order[index], order[index + 1]].sort().join("|");
        assert.equal(seen.has(pair), false, "repeated initial pairing: " + pair);
        seen.add(pair);
      }
    }
    assert.equal(seen.size, 28);
  });
  it("pushes same-series collisions behind unrelated first-stage pairs", () => {
    const items = [
      item("Magic Season 1"), item("Magic Season 2"), item("Magic The Movie"),
      item("Drama Season 1"), item("Drama Season 2"),
      item("Standalone X"), item("Standalone Y"), item("Standalone Z"),
    ];
    for (let generation = 0; generation < 7; generation += 1) {
      const arranged = diverseRankingOrder(items, generation);
      let firstCollision = Number.POSITIVE_INFINITY;
      let lastUnrelated = -1;
      for (let index = 0; index < arranged.length; index += 2) {
        const a = items.find(value => value.filePath === arranged[index])!;
        const b = items.find(value => value.filePath === arranged[index + 1])!;
        if (rankingSeriesKey(a) === rankingSeriesKey(b)) firstCollision = Math.min(firstCollision, index);
        else lastUnrelated = Math.max(lastUnrelated, index);
      }
      assert.ok(lastUnrelated < firstCollision, "collision scheduled before unrelated match");
    }
  });
  it("keeps full- and skip-round partitions exhaustive, with proof-backed confirmed ranks", () => {
    const items = Array.from({ length: 9 }, (_, index) => item("W" + index));
    const list = emptyRankingCollection();
    assert.deepEqual(rankingCounts(list, items), { ranked: 0, pending: 9, unranked: 0 });
    assert.ok(prepareRankingRounds(list, items, "full"));
    assert.deepEqual(rankingUnresolvedPaths(list, items).length, 9);
    let steps = 0;
    while (nextRankingPair(list)) {
      const pair = nextRankingPair(list)!;
      const choice = steps === 0 ? "skip" : pair.candidate < pair.reference ? "better" : "worse";
      decideRanking(list, items, choice);
      assert.equal(new Set([...list.ordered, ...rankingUnresolvedPaths(list, items)]).size, items.length);
      if (++steps > 100) throw Error("ranking did not terminate");
    }
    assert.equal(list.round, null);
    assert.equal(rankingCounts(list, items).ranked + rankingCounts(list, items).pending, items.length);
    assert.ok(rankingCounts(list, items).pending >= 1);
    for (let index = 1; index < list.ordered.length; index += 1) {
      assert.equal(provesBefore(list.evidence ?? {}, list.ordered[index - 1], list.ordered[index]), true);
    }
  });
  it("rerank uses new first-round pairings while still proving every confirmed relation", () => {
    const items = completedRankingItems(Array.from({ length: 8 }, (_, index) => item("Work " + index)), "anime");
    const list = emptyRankingCollection();
    const seen = new Set<string>();
    for (let round = 0; round < 3; round += 1) {
      assert.equal(prepareRankingRounds(list, items, "full"), true);
      const first: string[] = [];
      for (let step = 0; step < 4; step += 1) {
        const pair = nextRankingPair(list)!;
        const key = [pair.candidate, pair.reference].sort().join("|");
        assert.equal(seen.has(key), false);
        first.push(key); seen.add(key);
        assert.ok(decideRanking(list, items, pair.candidate < pair.reference ? "better" : "worse"));
      }
      while (nextRankingPair(list)) {
        const pair = nextRankingPair(list)!;
        decideRanking(list, items, pair.candidate < pair.reference ? "better" : "worse");
      }
      assert.equal(list.ordered.length, items.length);
      for (let index = 1; index < list.ordered.length; index += 1) {
        assert.ok(provesBefore(list.evidence ?? {}, list.ordered[index - 1], list.ordered[index]));
      }
    }
  });
});
