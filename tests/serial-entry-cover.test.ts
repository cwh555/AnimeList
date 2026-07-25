import assert from "node:assert/strict";
import test from "node:test";
import {
  confidentSerialCover,
  rankSerialCoverCandidates,
  selectOriginalTitle,
  serialCoverQuery,
} from "../src/serial-entry-cover";

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
