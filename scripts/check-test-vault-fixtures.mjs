import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  prepareTestFixtures,
  TEST_CHECKLIST_PATH,
  TEST_FIXTURE_VERSION,
  TEST_LIBRARY_ROOT,
} from "./test-vault-fixtures.mjs";

const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "animelist-test-vault-"));
let fetchCalls = 0;

const fakeFetch = async (url) => {
  fetchCalls += 1;
  assert.match(String(url), /^https:\/\/lain\.bgm\.tv\/pic\/cover\/l\//);
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9]);
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? "image/jpeg" : "" },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
};

function read(relativePath) {
  return fs.readFileSync(path.join(vaultRoot, relativePath), "utf8");
}

function allMarkdown(root) {
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) return [];
  const output = [];
  const visit = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && file.endsWith(".md")) output.push(file);
    }
  };
  visit(root);
  return output;
}

try {
  const legacyFixture = path.join(vaultRoot, "AnimeList/Test Fixtures/Anime/01-anime-planned.md");
  fs.mkdirSync(path.dirname(legacyFixture), { recursive: true });
  fs.writeFileSync(legacyFixture, "---\ntitle: \"TEST 動畫－未開始\"\nmedia_type: \"anime\"\n---\n");

  const first = await prepareTestFixtures(vaultRoot, { reset: false, fetchImpl: fakeFetch });
  assert.equal(first.files.length, 18);
  assert.equal(first.fixtureRoot, path.join(vaultRoot, TEST_LIBRARY_ROOT));
  assert.equal(first.checklistPath, path.join(vaultRoot, TEST_CHECKLIST_PATH));
  assert.equal(first.created, 18);
  assert.equal(first.reused, 0);
  assert.equal(first.reusedBySource, 0);
  assert.equal(first.repaired, 0);
  assert.equal(first.coversDownloaded, 18);
  assert.equal(first.legacyRemoved, 1);
  assert.equal(fetchCalls, 18);
  assert.equal(fs.existsSync(legacyFixture), false);

  const checklist = read(TEST_CHECKLIST_PATH);
  assert.match(checklist, /same managed folders used by normal collection/);
  assert.match(checklist, /Favorite: \*\*3\*\*/);
  assert.match(checklist, /Completed: \*\*5\*\*/);
  assert.match(checklist, /Wishlist \/ Planned: \*\*5\*\*/);
  assert.match(checklist, /Release Tracking live-provider check/);
  assert.match(checklist, /source_provider.*must not be MangaDex/i);
  assert.match(checklist, /npm run test-vault.*must not reset edits/i);

  const mediaNotes = allMarkdown(path.join(vaultRoot, TEST_LIBRARY_ROOT))
    .filter((file) => fs.readFileSync(file, "utf8").includes(`fixture_version: ${TEST_FIXTURE_VERSION}`));
  assert.equal(mediaNotes.length, 18);
  const allFixtures = mediaNotes.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(allFixtures, /title: "(?:TEST|SPECIAL)/);
  assert.doesNotMatch(allFixtures, /source_provider: "mangadex"/);
  assert.equal((allFixtures.match(/schema_version: 6/g) ?? []).length, 18);
  assert.equal((allFixtures.match(/source_provider: "bangumi"/g) ?? []).length, 18);
  assert.equal((allFixtures.match(new RegExp(`fixture_version: ${TEST_FIXTURE_VERSION}`, "g")) ?? []).length, 18);
  assert.equal((allFixtures.match(/cover: "AnimeList\/Covers\/(?:anime|manga|novel)\//g) ?? []).length, 18);
  assert.equal((allFixtures.match(/cover_remote: "https:\/\/lain\.bgm\.tv\/pic\/cover\/l\//g) ?? []).length, 18);
  assert.equal((allFixtures.match(/!\[\[AnimeList\/Covers\/(?:anime|manga|novel)\//g) ?? []).length, 18);

  for (const file of mediaNotes) {
    const content = fs.readFileSync(file, "utf8");
    const cover = content.match(/^cover: "([^"]+)"$/m)?.[1] ?? "";
    assert.ok(cover, `${file} must have a local cover path`);
    assert.equal(fs.statSync(path.join(vaultRoot, cover), { throwIfNoEntry: false })?.isFile(), true, `${cover} must exist`);
  }

  const frierenMangaPath = "AnimeList/Manga/葬送的芙莉蓮.md";
  const frierenManga = read(frierenMangaPath);
  assert.match(frierenManga, /title_original: "葬送のフリーレン"/);
  assert.match(frierenManga, /source_provider: "bangumi"/);
  assert.match(frierenManga, /source_id: "305429"/);
  assert.match(frierenManga, /cover: "AnimeList\/Covers\/manga\/葬送的芙莉蓮-bangumi-305429\.jpg"/);

  const alyaPath = "AnimeList/Novel/不時以俄語遮羞的艾莉同學.md";
  const alya = read(alyaPath);
  assert.match(alya, /source_id: "339092"/);
  assert.match(alya, /authors:\n  - "燦々SUN"/);
  assert.match(alya, /volume_log:/);

  const coverFiles = fs.readdirSync(path.join(vaultRoot, "AnimeList", "Covers"), { recursive: true })
    .filter((entry) => String(entry).endsWith(".jpg"));
  assert.equal(coverFiles.length, 18);

  const importedFrierenPath = "AnimeList/Manga/Imported/我已收藏的芙莉蓮.md";
  fs.mkdirSync(path.dirname(path.join(vaultRoot, importedFrierenPath)), { recursive: true });
  const collectedFrieren = read(frierenMangaPath)
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("fixture_version:") && !line.startsWith("fixture_case:"))
    .join("\n") + "\nUSER-COLLECTED NOTE MUST SURVIVE\n";
  fs.writeFileSync(path.join(vaultRoot, importedFrierenPath), collectedFrieren);
  fs.rmSync(path.join(vaultRoot, frierenMangaPath));
  fs.appendFileSync(path.join(vaultRoot, alyaPath), "\nUSER EDIT MUST SURVIVE\n");

  fetchCalls = 0;
  const second = await prepareTestFixtures(vaultRoot, { reset: false, fetchImpl: fakeFetch });
  assert.equal(second.created, 0);
  assert.equal(second.repaired, 0);
  assert.equal(second.reused, 18);
  assert.equal(second.reusedBySource, 1);
  assert.equal(second.coversDownloaded, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(fs.existsSync(path.join(vaultRoot, frierenMangaPath)), false);
  assert.match(read(importedFrierenPath), /USER-COLLECTED NOTE MUST SURVIVE/);
  assert.match(read(alyaPath), /USER EDIT MUST SURVIVE/);
  const frierenSourceMatches = allMarkdown(path.join(vaultRoot, "AnimeList", "Manga"))
    .filter((file) => /source_id: "305429"/.test(fs.readFileSync(file, "utf8")));
  assert.equal(frierenSourceMatches.length, 1);

  const alyaCover = path.join(vaultRoot, "AnimeList/Covers/novel/不時以俄語遮羞的艾莉同學-bangumi-339092.jpg");
  fs.rmSync(alyaCover);
  fetchCalls = 0;
  const repairedCover = await prepareTestFixtures(vaultRoot, { reset: false, fetchImpl: fakeFetch });
  assert.equal(repairedCover.reused, 18);
  assert.equal(repairedCover.reusedBySource, 1);
  assert.equal(repairedCover.coversDownloaded, 1);
  assert.equal(repairedCover.refreshed, 1);
  assert.equal(fetchCalls, 1);
  assert.match(read(alyaPath), /USER EDIT MUST SURVIVE/);
  assert.equal(fs.statSync(alyaCover).size > 0, true);

  const unrelated = path.join(vaultRoot, "AnimeList", "Novel", "My manual test note.md");
  fs.writeFileSync(unrelated, "# keep me\n");
  const reset = await prepareTestFixtures(vaultRoot, { reset: true, fetchImpl: fakeFetch });
  assert.equal(reset.files.length, 18);
  assert.equal(fs.existsSync(unrelated), true);
  assert.equal(fs.existsSync(path.join(vaultRoot, frierenMangaPath)), false);
  assert.match(read(importedFrierenPath), /USER-COLLECTED NOTE MUST SURVIVE/);
  assert.doesNotMatch(read(alyaPath), /USER EDIT MUST SURVIVE/);
  assert.equal(reset.repaired, 17);
  assert.equal(reset.reused, 1);
  assert.equal(reset.reusedBySource, 1);

  console.log("Shared Test Vault mirrors collected media: current schema, real local covers, source-ID reuse, legacy fixture cleanup, non-destructive startup, explicit reset.");
} finally {
  fs.rmSync(vaultRoot, { recursive: true, force: true });
}
