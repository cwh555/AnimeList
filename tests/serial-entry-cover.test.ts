import assert from "node:assert/strict";
import test from "node:test";
import {
  confidentSerialCover,
  rankSerialCoverCandidates,
  selectOriginalTitle,
  serialCoverQuery,
} from "../src/serial-entry-cover";
import {
  groupMissingSerialCoverRecords,
  missingSerialCoverEntryCount,
} from "../src/serial-cover-migration";


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

test("missing-cover migration groups entries by work and filters nonnumeric labels", () => {
  const works = groupMissingSerialCoverRecords([
    { filePath: "Manga/A.md", title: "A", mediaType: "manga", label: "5" },
    { filePath: "Manga/A.md", title: "A", mediaType: "manga", label: "3" },
    { filePath: "Manga/A.md", title: "A", mediaType: "manga", label: "5" },
    { filePath: "Novel/B.md", title: "B", mediaType: "novel", label: "EX" },
    { filePath: "Novel/B.md", title: "B", mediaType: "novel", label: "2.5" },
  ]);
  assert.deepEqual(works, [
    { filePath: "Manga/A.md", title: "A", mediaType: "manga", labels: ["3", "5"] },
    { filePath: "Novel/B.md", title: "B", mediaType: "novel", labels: ["2.5"] },
  ]);
  assert.equal(missingSerialCoverEntryCount(works), 3);
});
