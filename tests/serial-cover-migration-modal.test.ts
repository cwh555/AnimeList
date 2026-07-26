import assert from "node:assert/strict";
import test from "node:test";
import { formatSerialCoverMigrationReport } from "../src/serial-cover-migration-modal";

test("serial cover migration report summarizes counts and preserves detail order", () => {
  const output = formatSerialCoverMigrationReport({
    scanned: 5,
    loaded: 2,
    notFound: 1,
    failed: 1,
    skipped: 1,
    details: [{
      filePath: "AnimeList/Novel/Example.md",
      title: "Example title",
      label: "3",
      status: "loaded",
      message: "Cover loaded",
    }, {
      filePath: "AnimeList/Manga/Other.md",
      title: "Other title",
      label: "7",
      status: "not-found",
      message: "No confident match",
    }],
  });

  assert.equal(output, [
    "Scanned 5 entries. Loaded 2, not found 1, failed 1, skipped 1.",
    "LOADED · Example title · 3 · Cover loaded",
    "NOT-FOUND · Other title · 7 · No confident match",
  ].join("\n"));
});

test("serial cover migration report remains concise when there are no details", () => {
  assert.equal(formatSerialCoverMigrationReport({
    scanned: 0,
    loaded: 0,
    notFound: 0,
    failed: 0,
    skipped: 0,
    details: [],
  }), "Scanned 0 entries. Loaded 0, not found 0, failed 0, skipped 0.");
});
