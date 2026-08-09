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
  assert.match(checklist, /18 real works/);
  assert.match(checklist, /source: AnimeList\/Test Fixtures\/Special/);
  assert.match(checklist, /Favorite: \*\*3\*\* titles/);
  assert.match(checklist, /Completed: \*\*2\*\* titles/);
  assert.match(checklist, /Wishlist: \*\*2\*\* titles/);
  assert.match(checklist, /Ongoing: \*\*1\*\* title/);
  assert.match(checklist, /Release Tracking live-provider check/);
  assert.match(checklist, /葬送的芙莉蓮/);
  assert.match(checklist, /三坪房間的侵略者/);
  assert.match(checklist, /OVERLORD/);
  assert.match(checklist, /exactly one list button must be active/);
  assert.match(checklist, /Masterpiece → Favorite → Masterpiece/);
  assert.match(checklist, /fixture_preservation_marker/);
  assert.match(checklist, /add volume 9/i);

  const allFixtures = first.files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(allFixtures, /title: "(?:TEST|SPECIAL)/);
  assert.doesNotMatch(allFixtures, /genres:\n  - "測試資料"/);
  assert.match(allFixtures, /title_original:/);
  assert.match(allFixtures, /authors:/);
  assert.match(allFixtures, /studios:/);
  assert.match(allFixtures, /fixture_case:/);

  const plannedManga = readFixture(path.join("Manga", "04-manga-planned.md"));
  assert.match(plannedManga, /title: "葬送的芙莉蓮"/);
  assert.match(plannedManga, /title_original: "葬送のフリーレン"/);
  assert.match(plannedManga, /status: "planned"/);
  assert.match(plannedManga, /progress: 0/);
  assert.match(plannedManga, /authors:/);
  assert.match(plannedManga, /- "山田鐘人"/);
  assert.match(plannedManga, /source_provider: "mangadex"/);
  assert.match(plannedManga, /source_id: "b0b721ff-c388-4486-aa0f-c2b0bb321512"/);

  const novel = readFixture(path.join("Novel", "10-novel-add-volume.md"));
  assert.match(novel, /title: "不時以俄語遮羞的艾莉同學"/);
  assert.match(novel, /title_original: "時々ボソッとロシア語でデレる隣のアーリャさん"/);
  assert.match(novel, /status: "reading"/);
  assert.match(novel, /progress: 8/);
  assert.match(novel, /authors:\n  - "燦々SUN"/);
  assert.match(novel, /volume_log:/);
  assert.match(novel, /label: "8"/);

  const legacyFavorite = readFixture(path.join("Special", "14-special-legacy-favorite-completed.md"));
  assert.match(legacyFavorite, /title: "命運石之門"/);
  assert.match(legacyFavorite, /status: "completed"/);
  assert.match(legacyFavorite, /favorite: true/);
  assert.doesNotMatch(legacyFavorite, /masterpiece_labels:/);
  assert.match(legacyFavorite, /fixture_preservation_marker: "legacy-favorite-completed"/);
  assert.match(legacyFavorite, /> PRESERVE BODY: legacy-favorite-completed/);

  const multiLabel = readFixture(path.join("Special", "15-special-multi-label-ongoing.md"));
  assert.match(multiLabel, /title: "ONE PIECE"/);
  assert.match(multiLabel, /status: "ongoing"/);
  assert.match(multiLabel, /favorite: true/);
  assert.match(multiLabel, /masterpiece_labels:/);
  assert.match(multiLabel, /- "年度"/);
  assert.match(multiLabel, /- "長篇"/);
  assert.match(multiLabel, /fixture_preservation_marker: "multi-label-ongoing"/);

  const sharedLabel = readFixture(path.join("Special", "16-special-shared-label-planned.md"));
  assert.match(sharedLabel, /title: "BLUE LOCK 藍色監獄"/);
  assert.match(sharedLabel, /status: "planned"/);
  assert.match(sharedLabel, /favorite: true/);
  assert.match(sharedLabel, /- "年度"/);

  const retainedLabel = readFixture(path.join("Special", "17-special-retained-label-completed.md"));
  assert.match(retainedLabel, /title: "果然我的青春戀愛喜劇搞錯了。"/);
  assert.match(retainedLabel, /status: "completed"/);
  assert.match(retainedLabel, /favorite: false/);
  assert.match(retainedLabel, /- "青春"/);
  assert.match(retainedLabel, /fixture_preservation_marker: "retained-label-completed"/);

  const control = readFixture(path.join("Special", "18-special-control-planned.md"));
  assert.match(control, /title: "86－不存在的戰區－"/);
  assert.match(control, /status: "planned"/);
  assert.match(control, /favorite: false/);
  assert.doesNotMatch(control, /masterpiece_labels:/);

  fs.writeFileSync(path.join(first.fixtureRoot, "temporary-edit.txt"), "discard me\n");
  const second = prepareTestFixtures(vaultRoot);
  assert.equal(fs.existsSync(path.join(second.fixtureRoot, "temporary-edit.txt")), false);
  assert.equal(second.files.length, 18);

  console.log("Generated shared test-vault fixtures are meaningful, valid, and reset deterministically.");
} finally {
  fs.rmSync(vaultRoot, { recursive: true, force: true });
}
