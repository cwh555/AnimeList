import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareRankingTestFixtures } from "./ranking-test-vault-fixtures.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "animelist-ranking-vault-"));
try {
  const first = prepareRankingTestFixtures(root);
  assert.equal(first.created, 18);
  assert.equal(fs.existsSync(first.checklist), true);
  const target = path.join(root, "AnimeList", "Test Fixtures", "Ranking");
  for (const type of ["anime", "manga", "novel"]) {
    for (let i = 1; i <= 6; i++) {
      const key = type + "-" + i;
      const note = fs.readFileSync(path.join(target, key + ".md"), "utf8");
      assert.match(note, new RegExp("^media_type: " + type + "$", "m"));
      assert.match(note, new RegExp("^status: " + (i <= 5 ? "completed" : "ongoing") + "$", "m"));
      const cover = path.join(root, "AnimeList", "Covers", "ranking-fixtures", key + ".svg");
      assert.ok(fs.statSync(cover).size > 100);
    }
  }
  const preserved = path.join(target, "anime-1.md");
  fs.appendFileSync(preserved, "\nPersonal test edit\n");
  const second = prepareRankingTestFixtures(root);
  assert.equal(second.created, 0);
  assert.match(fs.readFileSync(preserved, "utf8"), /Personal test edit/);
  console.log("Ranking test vault fixtures: complete, repeatable, non-destructive");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
