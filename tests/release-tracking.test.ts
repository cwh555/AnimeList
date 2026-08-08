import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareChapterLabels,
  groupPublicationLines,
  latestNumericChapter,
  providerResultRegressed,
  selectLatestPublishedRecord,
  type NdlPublicationRecord,
  type ReleaseTrackingBinding,
} from "../src/domain/release-tracking";

function record(overrides: Partial<NdlPublicationRecord> = {}): NdlPublicationRecord {
  return {
    sourceId: "id",
    sourceUrl: "https://example.test/book",
    title: "Re:ゼロから始める異世界生活",
    seriesTitle: "Re:ゼロから始める異世界生活",
    volume: "44",
    creators: ["長月達平"],
    publisher: "KADOKAWA",
    publishedAt: "2025-12-25",
    isbn: "",
    ...overrides,
  };
}

describe("release tracking domain", () => {
  it("orders decimal manga chapters without converting labels to integers", () => {
    assert.equal(compareChapterLabels("231", "231.1"), -1);
    assert.equal(compareChapterLabels("231.1", "231.2"), -1);
    assert.equal(compareChapterLabels("232", "231.2"), 1);
    assert.equal(latestNumericChapter(["230", "231.1", "Special", "231.2", "232"]), "232");
  });

  it("ignores non-numeric manga labels for the tracked latest chapter", () => {
    assert.equal(latestNumericChapter(["Extra", "Oneshot", "12.5", "12"]), "12.5");
    assert.equal(latestNumericChapter(["Extra", "Oneshot"]), "");
  });

  it("never treats an older MangaDex chapter as a valid forward refresh", () => {
    assert.equal(providerResultRegressed("147", "", "145", "", "mangadex"), true);
    assert.equal(providerResultRegressed("147", "", "147", "", "mangadex"), false);
    assert.equal(providerResultRegressed("147", "", "148", "", "mangadex"), false);
  });

  it("groups NDL records by publication line instead of title alone", () => {
    const lines = groupPublicationLines([
      record({ sourceId: "novel-15", title: "薬屋のひとりごと", seriesTitle: "薬屋のひとりごと", volume: "15", creators: ["日向夏"], publisher: "イマジカインフォス" }),
      record({ sourceId: "novel-16", title: "薬屋のひとりごと", seriesTitle: "薬屋のひとりごと", volume: "16", creators: ["日向夏"], publisher: "イマジカインフォス" }),
      record({ sourceId: "manga-17", title: "薬屋のひとりごと", seriesTitle: "薬屋のひとりごと", volume: "17", creators: ["日向夏"], publisher: "スクウェア・エニックス" }),
    ], ["薬屋のひとりごと"]);
    assert.equal(lines.length, 2);
    assert.deepEqual(lines.map((line) => line.publisher).sort(), ["イマジカインフォス", "スクウェア・エニックス"]);
  });

  it("selects the newest already-published NDL volume by chronology, not label shape", () => {
    const binding: ReleaseTrackingBinding = {
      provider: "ndl-jpro",
      title: "ようこそ実力至上主義の教室へ",
      creator: "衣笠彰梧",
      publisher: "KADOKAWA",
    };
    const records = [
      record({ sourceId: "a", title: "ようこそ実力至上主義の教室へ", seriesTitle: "ようこそ実力至上主義の教室へ", volume: "2年生編12.5", creators: ["衣笠彰梧"], publishedAt: "2025-02-25" }),
      record({ sourceId: "b", title: "ようこそ実力至上主義の教室へ", seriesTitle: "ようこそ実力至上主義の教室へ", volume: "3年生編4", creators: ["衣笠彰梧"], publishedAt: "2026-07-25" }),
      record({ sourceId: "future", title: "ようこそ実力至上主義の教室へ", seriesTitle: "ようこそ実力至上主義の教室へ", volume: "3年生編5", creators: ["衣笠彰梧"], publishedAt: "2026-09-25" }),
    ];
    const latest = selectLatestPublishedRecord(records, binding, new Date("2026-08-08T12:00:00Z"));
    assert.equal(latest?.volume, "3年生編4");
  });

  it("keeps side stories out when the verified publication line differs", () => {
    const binding: ReleaseTrackingBinding = {
      provider: "ndl-jpro",
      title: "無職転生",
      creator: "理不尽な孫の手",
      publisher: "KADOKAWA",
    };
    const latest = selectLatestPublishedRecord([
      record({ sourceId: "main", title: "無職転生", seriesTitle: "無職転生", volume: "26", creators: ["理不尽な孫の手"], publisher: "KADOKAWA", publishedAt: "2022-11-25" }),
      record({ sourceId: "side", title: "無職転生 蛇足編", seriesTitle: "無職転生 蛇足編", volume: "3", creators: ["理不尽な孫の手"], publisher: "KADOKAWA", publishedAt: "2025-06-25" }),
    ], binding, new Date("2026-08-08T12:00:00Z"));
    assert.equal(latest?.volume, "26");
  });

  it("detects NDL chronology regressions without comparing volume labels", () => {
    assert.equal(providerResultRegressed("45", "2026-06-25", "44", "2025-12-25", "ndl-jpro"), true);
    assert.equal(providerResultRegressed("3年生編4", "2026-07-25", "3年生編4", "2026-07-25", "ndl-jpro"), false);
  });
});
