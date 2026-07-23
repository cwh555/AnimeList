import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareTestFixtures, TEST_CHECKLIST_PATH, TEST_FIXTURE_ROOT } from "./test-vault-fixtures.mjs";

const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "animelist-test-vault-"));

try {
  const first = prepareTestFixtures(vaultRoot);
  assert.equal(first.files.length, 13);
  assert.equal(first.fixtureRoot, path.join(vaultRoot, TEST_FIXTURE_ROOT));
  assert.equal(first.checklistPath, path.join(vaultRoot, TEST_CHECKLIST_PATH));
  assert.equal(fs.existsSync(first.checklistPath), true);

  const checklist = fs.readFileSync(first.checklistPath, "utf8");
  assert.match(checklist, /source: AnimeList\/Test Fixtures/);
  assert.match(checklist, /Add volume/);
  assert.match(checklist, /Planned: empty track/);

  const novel = fs.readFileSync(
    path.join(vaultRoot, TEST_FIXTURE_ROOT, "Novel", "10-novel-add-volume.md"),
    "utf8",
  );
  assert.match(novel, /status: "reading"/);
  assert.match(novel, /progress: 14/);
  assert.match(novel, /volume_log:/);
  assert.match(novel, /label: "14"/);

  const plannedManga = fs.readFileSync(
    path.join(vaultRoot, TEST_FIXTURE_ROOT, "Manga", "04-manga-planned.md"),
    "utf8",
  );
  assert.match(plannedManga, /status: "planned"/);
  assert.match(plannedManga, /progress: 0/);

  fs.writeFileSync(path.join(first.fixtureRoot, "temporary-edit.txt"), "discard me\n");
  const second = prepareTestFixtures(vaultRoot);
  assert.equal(fs.existsSync(path.join(second.fixtureRoot, "temporary-edit.txt")), false);
  assert.equal(second.files.length, 13);

  console.log("Generated test-vault fixtures are valid and reset deterministically.");
} finally {
  fs.rmSync(vaultRoot, { recursive: true, force: true });
}
