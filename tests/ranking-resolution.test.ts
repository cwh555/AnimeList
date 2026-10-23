import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MediaItem } from "../src/domain/media-types";
import { legacyRankingEvidence, provesBefore, recordRankingEvidence } from "../src/domain/ranking-evidence";
import { provenRankingChoice, provenRankingBounds, resolveProvenRoundPairs } from "../src/domain/ranking-resolution";
import { startRankingRound, nextRoundPair } from "../src/domain/ranking-rounds";
import {
  emptyRankingCollection, nextRankingPair, prepareRankingRounds, decideRanking,
  reconcileRanking, resumePendingRanking, rankingPositionProjection,
} from "../src/domain/pairwise-ranking";

const item = (path: string): MediaItem => ({
  filePath: path, title: path, originalTitle: "", mediaType: "anime", status: "completed",
} as MediaItem);

describe("ranking never reasks strict-transitive comparisons", () => {
  it("narrows insertion with proof outside the candidate's saved answers", () => {
    const eligible = ["A","B","C","X"].map(item);
    const list = emptyRankingCollection();
    list.ordered = ["A","B","C"];
    list.evidence = legacyRankingEvidence(list.ordered);
    recordRankingEvidence(list.evidence, "A", "X");
    recordRankingEvidence(list.evidence, "X", "C");
    list.pending.X = { path:"X", comparisons:{} };
    assert.equal(resumePendingRanking(list, eligible, "X"), true);
    assert.deepEqual(nextRankingPair(list), { candidate:"X", reference:"B" });
    assert.equal(decideRanking(list, eligible, "worse"), true);
    assert.deepEqual(list.ordered, ["A","B","X","C"]);
    assert.equal(nextRankingPair(list), null);
    assert.equal(Object.keys(list.pending).length, 0);
    for (let i = 1; i < list.ordered.length; i += 1) {
      assert.equal(provesBefore(list.evidence, list.ordered[i-1], list.ordered[i]), true);
    }
  });
  it("preserves skip as unknown even when another reference is provable", () => {
    const list = emptyRankingCollection();
    list.ordered = ["A","B","C"];
    list.evidence = legacyRankingEvidence(list.ordered);
    recordRankingEvidence(list.evidence,"A","X");
    const attempt = { path:"X", comparisons:{ B:"skip" as const } };
    assert.deepEqual(provenRankingBounds(list.ordered,attempt,list.evidence),{first:1,last:3});
    assert.equal(provenRankingChoice(list.evidence,"X","B"),null);
    list.active = attempt;
    assert.deepEqual(nextRankingPair(list),{candidate:"X",reference:"C"});
  });
  it("on an old saved round, skips only forced matchups and counts user choices only", () => {
    const round = startRankingRound(["A","B","C","D"],"full");
    const proof = { A:["B","C"], C:["D"] };
    const finished = resolveProvenRoundPairs(round,proof);
    assert.equal(finished,null);
    assert.deepEqual(nextRoundPair(round),{candidate:"B",reference:"C"});
    assert.equal(round.comparisons,0);
    // Projected completion is stable across persisted JSON reload.
    const restored = JSON.parse(JSON.stringify(round)) as typeof round;
    assert.deepEqual(resolveProvenRoundPairs(restored,proof),null);
    assert.deepEqual(restored,round);
  });
  it("completes a saved entirely-proven round without requiring any question", () => {
    const eligible = ["A","B","C","D"].map(item);
    const list = emptyRankingCollection();
    list.round = startRankingRound(["A","B","C","D"],"full");
    list.evidence = legacyRankingEvidence(["A","B","C","D"]);
    reconcileRanking(list,eligible);
    assert.equal(list.round,null);
    assert.deepEqual(list.ordered,["A","B","C","D"]);
    assert.equal(nextRankingPair(list),null);
    assert.deepEqual(rankingPositionProjection(list,eligible).confirmed.length,4);
  });
  it("rejects actual cyclic data but never treats unknown as a forced answer", () => {
    assert.equal(provenRankingChoice({ A:["B"] },"A","C"),null);
    assert.throws(()=>provenRankingChoice({A:["B"],B:["A"]},"A","B"),/Contradictory/);
    assert.throws(()=>provenRankingBounds(["A","B"],{path:"X",comparisons:{B:"better"}},
      {A:["B","X"],B:["X"]}),/Contradictory/);
  });
  it("never presents known pairs for adversarial votes across full and resumed rounds", () => {
    for (const count of [5,13,33,176]) {
      const eligible = Array.from({length:count},(_,i)=>item("media-"+String(i).padStart(3,"0")));
      const list = emptyRankingCollection();
      assert.equal(prepareRankingRounds(list,eligible,"full"),true);
      let steps=0;
      while (nextRankingPair(list)) {
        const pair = nextRankingPair(list)!;
        assert.equal(provenRankingChoice(list.evidence,pair.candidate,pair.reference),null,
          "presented a relation that was already provable");
        // Deliberately context-dependent choices rather than a fixed order.
        const vote = ((steps * 41 + count * 7 + steps * steps) % 17) < 8 ? "better" : "worse";
        assert.equal(decideRanking(list,eligible,vote),true);
        steps += 1;
        assert.ok(steps < count*16,"ranking did not terminate");
      }
      assert.equal(list.round,null);
      assert.equal(list.ordered.length,count);
      assert.ok(steps > 0);
    }
  });
});
