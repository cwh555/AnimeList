import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareChapterLabels,
  groupPublicationLines,
  latestNumericChapter,
  parsePublishedDate,
  providerResultRegressed,
  selectLatestPublishedRecord,
  selectSafeNovelPublicationLine,
  type NdlPublicationRecord,
  type ReleaseTrackingBinding,
} from "../src/domain/release-tracking";

function record(overrides: Partial<NdlPublicationRecord> = {}): NdlPublicationRecord {
  return {
    sourceId: "id",
    sourceUrl: "https://example.test/book",
    title: "Re:ゼロから始める異世界生活",
    seriesTitle: "MF文庫J ; な-07-01",
    volume: "44",
    creators: ["長月, 達平, 1987-"],
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

  it("accepts common NDL/JPRO publication date formats without guessing missing dates", () => {
    const expected = Date.UTC(2026, 5, 25);
    assert.equal(parsePublishedDate("2026-06-25"), expected);
    assert.equal(parsePublishedDate("2026.6.25"), expected);
    assert.equal(parsePublishedDate("2026/6/25"), expected);
    assert.equal(parsePublishedDate("2026年6月25日"), expected);
    assert.equal(parsePublishedDate("unknown"), null);
  });

  it("groups numbered bibliographic series entries into one novel imprint line", () => {
    const lines = groupPublicationLines([
      record({ sourceId: "48", title: "六畳間の侵略者!?", seriesTitle: "HJ文庫 ; た03-02-50", volume: "48", creators: ["健速"], publisher: "ホビージャパン", publishedAt: "2025" }),
      record({ sourceId: "49", title: "六畳間の侵略者!?", seriesTitle: "HJ文庫 ; た03-02-51", volume: "49", creators: ["健速"], publisher: "ホビージャパン", publishedAt: "2026" }),
    ], ["六畳間の侵略者!?"], ["健速"]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.imprint, "HJ文庫");
    assert.equal(lines[0]?.records.length, 2);
    assert.equal(selectSafeNovelPublicationLine(lines, true)?.imprint, "HJ文庫");
  });

  it("keeps publisher changes inside the same novel imprint and rejects comic adaptations", () => {
    const lines = groupPublicationLines([
      record({ sourceId: "novel-15", title: "薬屋のひとりごと", seriesTitle: "ヒーロー文庫 ; ひ-1", volume: "15", creators: ["日向, 夏"], publisher: "主婦の友インフォス", publishedAt: "2024" }),
      record({ sourceId: "novel-16", title: "薬屋のひとりごと", seriesTitle: "ヒーロー文庫", volume: "16", creators: ["日向夏"], publisher: "イマジカインフォス", publishedAt: "2025" }),
      record({ sourceId: "manga-17", title: "薬屋のひとりごと", seriesTitle: "ビッグガンガンコミックス", volume: "17", creators: ["日向, 夏", "ねこクラゲ"], publisher: "スクウェア・エニックス", publishedAt: "2026" }),
      record({ sourceId: "manga-22", title: "薬屋のひとりごと : 猫猫の後宮謎解き手帳", seriesTitle: "サンデーGXコミックス", volume: "22", creators: ["日向, 夏", "倉田, 三ノ路"], publisher: "小学館", publishedAt: "2026" }),
    ], ["薬屋のひとりごと"], ["日向夏"]);
    assert.equal(lines.length, 3);
    const selected = selectSafeNovelPublicationLine(lines, true);
    assert.equal(selected?.imprint, "ヒーロー文庫");
    assert.equal(selected?.records.length, 2);
  });

  it("can safely auto-select an exact-title creator-matched novel even when its imprint is absent", () => {
    const lines = groupPublicationLines([
      record({ sourceId: "novel-15", title: "オーバーロード", seriesTitle: "", volume: "15", creators: ["丸山, くがね"], publisher: "エンターブレイン", publishedAt: "2021" }),
      record({ sourceId: "novel-16", title: "オーバーロード", seriesTitle: "", volume: "16", creators: ["丸山くがね"], publisher: "KADOKAWA", publishedAt: "2022" }),
      record({ sourceId: "comic-4", title: "オーバーロード〈新〉世界編", seriesTitle: "角川コミックス・エース", volume: "4", creators: ["丸山, くがね", "Matsuki"], publisher: "KADOKAWA", publishedAt: "2026" }),
    ], ["オーバーロード"], ["丸山くがね"]);
    const selected = selectSafeNovelPublicationLine(lines, true);
    assert.equal(selected?.medium, "unknown");
    assert.equal(selected?.records.length, 2);
  });

  it("excludes side-story labels from the main publication line", () => {
    const lines = groupPublicationLines([
      record({ sourceId: "main", title: "Re:ゼロから始める異世界生活", seriesTitle: "MF文庫J ; な-07-62", volume: "45", publishedAt: "2026" }),
      record({ sourceId: "short", title: "Re:ゼロから始める異世界生活", seriesTitle: "MF文庫J ; な-07-63", volume: "短編集13", publishedAt: "2025" }),
      record({ sourceId: "side", title: "無職転生", seriesTitle: "MFブックス", volume: "蛇足編3", creators: ["理不尽な孫の手"], publishedAt: "2025" }),
    ], ["Re:ゼロから始める異世界生活"], ["長月達平"]);
    assert.equal(lines.length, 1);
    assert.deepEqual(lines[0]?.records.map((entry) => entry.sourceId), ["main"]);
  });

  it("selects the newest already-published NDL volume by chronology, not label shape", () => {
    const binding: ReleaseTrackingBinding = {
      provider: "ndl-jpro",
      title: "ようこそ実力至上主義の教室へ",
      creator: "衣笠彰梧",
      imprint: "MF文庫J",
    };
    const records = [
      record({ sourceId: "a", title: "ようこそ実力至上主義の教室へ", seriesTitle: "MF文庫J ; き-05-60", volume: "2年生編12.5", creators: ["衣笠, 彰梧"], publishedAt: "2025-02-25" }),
      record({ sourceId: "b", title: "ようこそ実力至上主義の教室へ", seriesTitle: "MF文庫J ; き-05-70", volume: "3年生編4", creators: ["衣笠彰梧"], publishedAt: "2026-07-25" }),
      record({ sourceId: "future", title: "ようこそ実力至上主義の教室へ", seriesTitle: "MF文庫J ; き-05-71", volume: "3年生編5", creators: ["衣笠彰梧"], publishedAt: "2026-09-25" }),
    ];
    const latest = selectLatestPublishedRecord(records, binding, new Date("2026-08-08T12:00:00Z"));
    assert.equal(latest?.volume, "3年生編4");
  });

  it("detects NDL chronology regressions without comparing volume labels", () => {
    assert.equal(providerResultRegressed("45", "2026-06-25", "44", "2025-12-25", "ndl-jpro"), true);
    assert.equal(providerResultRegressed("3年生編4", "2026-07-25", "3年生編4", "2026-07-25", "ndl-jpro"), false);
  });
});
