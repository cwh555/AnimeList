import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareTestFixtures, TEST_CHECKLIST_PATH, TEST_FIXTURE_ROOT } from "./test-vault-fixtures.mjs";

const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "animelist-test-vault-"));

function readFixture(relativePath) {
  return fs.readFileSync(path.join(vaultRoot, TEST_FIXTURE_ROOT, relativePath), "utf8");
}

try {
  const first = prepareTestFixtures(vaultRoot);
  assert.equal(first.files.length, 18);
  assert.equal(first.fixtureRoot, path.join(vaultRoot, TEST_FIXTURE_ROOT));
  assert.equal(first.checklistPath, path.join(vaultRoot, TEST_CHECKLIST_PATH));
  assert.equal(fs.existsSync(first.checklistPath), true);

  const checklist = fs.readFileSync(first.checklistPath, "utf8");
  assert.match(checklist, /source: AnimeList\/Test Fixtures/);
  assert.match(checklist, /All: \*\*5\*\* SPECIAL titles/);
  assert.match(checklist, /Favorite: \*\*3\*\* titles/);
  assert.match(checklist, /Completed: \*\*2\*\* titles/);
  assert.match(checklist, /Wishlist: \*\*2\*\* titles/);
  assert.match(checklist, /Ongoing: \*\*1\*\* title/);
  assert.match(checklist, /exactly one list button must be active/);
  assert.match(checklist, /Masterpiece → Favorite → Masterpiece/);
  assert.match(checklist, /fixture_preservation_marker/);
  assert.match(checklist, /Add volume/);

  const novel = readFixture(path.join("Novel", "10-novel-add-volume.md"));
  assert.match(novel, /status: "reading"/);
  assert.match(novel, /progress: 14/);
  assert.match(novel, /volume_log:/);
  assert.match(novel, /label: "14"/);

  const plannedManga = readFixture(path.join("Manga", "04-manga-planned.md"));
  assert.match(plannedManga, /status: "planned"/);
  assert.match(plannedManga, /progress: 0/);

  const legacyFavorite = readFixture(path.join("Special", "14-special-legacy-favorite-completed.md"));
  assert.match(legacyFavorite, /status: "completed"/);
  assert.match(legacyFavorite, /favorite: true/);
  assert.doesNotMatch(legacyFavorite, /masterpiece_labels:/);
  assert.match(legacyFavorite, /fixture_preservation_marker: "legacy-favorite-completed"/);
  assert.match(legacyFavorite, /> PRESERVE BODY: legacy-favorite-completed/);

  const multiLabel = readFixture(path.join("Special", "15-special-multi-label-ongoing.md"));
  assert.match(multiLabel, /status: "ongoing"/);
  assert.match(multiLabel, /favorite: true/);
  assert.match(multiLabel, /masterpiece_labels:/);
  assert.match(multiLabel, /- "戀愛 masterpiece"/);
  assert.match(multiLabel, /- "年度 masterpiece"/);
  assert.match(multiLabel, /fixture_preservation_marker: "multi-label-ongoing"/);
  assert.match(multiLabel, /> PRESERVE BODY: multi-label-ongoing/);

  const sharedLabel = readFixture(path.join("Special", "16-special-shared-label-planned.md"));
  assert.match(sharedLabel, /status: "planned"/);
  assert.match(sharedLabel, /favorite: true/);
  assert.match(sharedLabel, /- "戀愛 masterpiece"/);

  const retainedLabel = readFixture(path.join("Special", "17-special-retained-label-completed.md"));
  assert.match(retainedLabel, /status: "completed"/);
  assert.match(retainedLabel, /favorite: false/);
  assert.match(retainedLabel, /- "保留分類 masterpiece"/);
  assert.match(retainedLabel, /fixture_preservation_marker: "retained-label-completed"/);
  assert.match(retainedLabel, /> PRESERVE BODY: retained-label-completed/);

  const control = readFixture(path.join("Special", "18-special-control-planned.md"));
  assert.match(control, /status: "planned"/);
  assert.match(control, /favorite: false/);
  assert.doesNotMatch(control, /masterpiece_labels:/);

  fs.writeFileSync(path.join(first.fixtureRoot, "temporary-edit.txt"), "discard me\n");
  const second = prepareTestFixtures(vaultRoot);
  assert.equal(fs.existsSync(path.join(second.fixtureRoot, "temporary-edit.txt")), false);
  assert.equal(second.files.length, 18);

  console.log("Generated test-vault fixtures are valid and reset deterministically.");
} finally {
  fs.rmSync(vaultRoot, { recursive: true, force: true });
}
