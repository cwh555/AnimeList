import assert from "node:assert/strict";
import { test } from "node:test";
import { completionDateTimestamp, isUnknownCompletionDate, normalizeCompletionDate } from "../src/domain/completion-date";
import { compareLibraryCompletion } from "../src/domain/library-sort";

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
