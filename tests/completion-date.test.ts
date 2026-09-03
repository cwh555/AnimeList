import assert from "node:assert/strict";
import { test } from "node:test";
import { completionDateTimestamp, isUnknownCompletionDate, normalizeCompletionDate } from "../src/domain/completion-date";
import { compareLibraryCompletion } from "../src/domain/library-sort";
import { compareMediaTitles, naturalMediaTitleKey, structuralMediaTitleKey } from "../src/domain/media-title-sort";

test("completion date accepts a real date or the explicit undated sentinel", () => {
  assert.equal(normalizeCompletionDate("2026-08-22"), "2026-08-22");
  assert.equal(normalizeCompletionDate("unknown"), "unknown");
  assert.equal(normalizeCompletionDate("UNKNOWN"), "unknown");
  assert.equal(normalizeCompletionDate("2026-02-30"), "");
  assert.equal(isUnknownCompletionDate(" unknown "), true);
  assert.equal(completionDateTimestamp("unknown"), null);
});

test("ongoing works sort as newest while undated completions stay last", () => {
  const ongoing = { status: "ongoing", completedAt: "" } as const;
  const recent = { status: "completed", completedAt: "2026-08-20" } as const;
  const old = { status: "completed", completedAt: "2025-01-01" } as const;
  const unknown = { status: "completed", completedAt: "unknown" } as const;
  const desc = [old, unknown, recent, ongoing].sort((a, b) => compareLibraryCompletion(a, b, "desc"));
  assert.deepEqual(desc, [ongoing, recent, old, unknown]);
  const asc = [ongoing, unknown, recent, old].sort((a, b) => compareLibraryCompletion(a, b, "asc"));
  assert.deepEqual(asc, [old, recent, ongoing, unknown]);
});

test("structural season and volume ordinals use natural title order", () => {
  const titles = ["作品 第十季", "作品 第二季", "作品 第一季", "作品 第三季"];
  assert.deepEqual(
    titles.sort(compareMediaTitles),
    ["作品 第一季", "作品 第二季", "作品 第三季", "作品 第十季"],
  );
  assert.equal(compareMediaTitles("作品 第2季", "作品 第10季") < 0, true);
  assert.equal(compareMediaTitles("小說 第九卷", "小說 第十卷") < 0, true);
  assert.equal(naturalMediaTitleKey("作品 第二〇二六季"), "作品 第2026季");
});

test("explicit installments stay adjacent to the same base work before nearby titles", () => {
  const titles = [
    "作品 外傳",
    "作品 第十季",
    "作品 第二季",
    "作品 第一季",
    "另一作品",
  ];
  assert.deepEqual(
    titles.sort(compareMediaTitles),
    ["另一作品", "作品 第一季", "作品 第二季", "作品 第十季", "作品 外傳"],
  );
  assert.deepEqual(structuralMediaTitleKey("Show Season 10"), {
    base: "Show",
    kind: "season",
    number: 10,
    full: "Show Season 10",
  });
  assert.equal(compareMediaTitles("Show Season 2", "Show Season 10") < 0, true);
  assert.equal(compareMediaTitles("作品 第2クール", "作品 第10クール") < 0, true);
  assert.equal(compareMediaTitles("小說 Volume 2", "小說 Volume 10") < 0, true);
});

test("ordinary digits inside a title are not treated as installment markers", () => {
  assert.deepEqual(structuralMediaTitleKey("86―エイティシックス―"), {
    base: "86―エイティシックス―",
    kind: null,
    number: null,
    full: "86―エイティシックス―",
  });
});

test("same-day completion ties use ascending natural title order in both date directions", () => {
  const first = { status: "completed", completedAt: "2026-08-20", title: "作品 第一季" } as const;
  const second = { status: "completed", completedAt: "2026-08-20", title: "作品 第二季" } as const;
  const tenth = { status: "completed", completedAt: "2026-08-20", title: "作品 第十季" } as const;
  const expected = [first, second, tenth];
  assert.deepEqual(
    [tenth, second, first].sort((a, b) => compareLibraryCompletion(a, b, "desc")),
    expected,
  );
  assert.deepEqual(
    [tenth, first, second].sort((a, b) => compareLibraryCompletion(a, b, "asc")),
    expected,
  );
});
