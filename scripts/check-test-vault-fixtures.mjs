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
import {
  applyReleaseTrackingTestFixtureMetadata,
  RELEASE_TRACKING_MANGA_ANILIST_IDS,
} from "./release-tracking-test-fixtures.mjs";

const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "animelist-test-vault-"));
let fetchCalls = 0;

const fakeFetch = async (url) => {
  fetchCalls += 1;
  const value = String(url);
  const isCover = /^https:\/\/lain\.bgm\.tv\/pic\/cover\/l\//.test(value);
  const isMomentScene = /^https:\/\/(?:frieren-anime\.jp\/wp-content\/uploads\/2023\/09\/01_\d{2}\.jpg|kaguya\.love\/1st\/assets\/img\/story\/01\/\d{2}\.jpg)$/.test(value);
  assert.ok(isCover || isMomentScene, `unexpected Test Vault image URL: ${value}`);
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
  // Simulate a Test Vault that carries the previous image-fixture marker but
  // is missing the image blocks. The next revision must seed them once.
  fs.writeFileSync(path.join(vaultRoot, ".animelist-test-image-sections-v6"), "stale previous image fixture marker\n");

  const legacyFixture = path.join(vaultRoot, "AnimeList/Test Fixtures/Anime/01-anime-planned.md");
  fs.mkdirSync(path.dirname(legacyFixture), { recursive: true });
  fs.writeFileSync(legacyFixture, "---\ntitle: \"TEST 動畫－未開始\"\nmedia_type: \"anime\"\n---\n");

  const first = await prepareTestFixtures(vaultRoot, { reset: false, fetchImpl: fakeFetch });
  const firstReleaseTracking = applyReleaseTrackingTestFixtureMetadata(first);
  assert.deepEqual(firstReleaseTracking, { updated: 5, verified: 5 });
  assert.equal(first.files.length, 18);
  assert.equal(first.fixtureRoot, path.join(vaultRoot, TEST_LIBRARY_ROOT));
  assert.equal(first.checklistPath, path.join(vaultRoot, TEST_CHECKLIST_PATH));
  assert.equal(first.created, 18);
  assert.equal(first.reused, 0);
  assert.equal(first.reusedBySource, 0);
  assert.equal(first.repaired, 0);
  assert.equal(first.coversDownloaded, 18);
  assert.equal(first.legacyRemoved, 1);
  assert.equal(fetchCalls, 31);
  assert.equal(fs.existsSync(legacyFixture), false);

  const checklist = read(TEST_CHECKLIST_PATH);
  assert.match(checklist, /same managed folders used by normal collection/);
  assert.match(checklist, /Favorite: \*\*3\*\*/);
  assert.match(checklist, /Completed: \*\*5\*\*/);
  assert.match(checklist, /Wishlist \/ Planned: \*\*5\*\*/);
  assert.match(checklist, /Release Tracking live-provider check/);
  assert.match(checklist, /source_provider.*must not be MangaDex/i);
  assert.match(checklist, /Official-source coverage expectations/);
  assert.match(checklist, /anilist_id.*official external-link path/i);
  assert.match(checklist, /Ch\.111/);
  assert.match(checklist, /Ch\.147/);
  assert.match(checklist, /Ch\.72/);
  assert.match(checklist, /Ch\.281/);
  assert.match(checklist, /npm run test-vault.*must not reset edits/i);
  assert.match(checklist, /Reusable image sections/);
  assert.match(checklist, /real works and official anime episode stills/i);
  assert.match(checklist, /Add modal uses the available width without horizontal scrolling/i);
  assert.match(checklist, /Updates & cleanup/i);
  assert.match(checklist, /old default duplicate cover embed/i);
  assert.match(checklist, /## 8\. Moments sections/);
  assert.match(checklist, /seven-image Frieren Moment/i);
  assert.match(checklist, /source \/ position-time \/ speaker-character \/ tags \/ note/i);
  assert.match(checklist, /official episode stills/i);
  assert.match(checklist, /not committed to the repository/i);
  assert.equal(first.imageSectionDemos.demoPaths.length, 3);
  assert.equal(first.imageSectionDemos.assetPaths.length, 13);
  assert.equal(first.momentsDemos.demoPaths.length, 2);
  assert.equal(first.momentsDemos.assetPaths.length, 13);
  for (const asset of first.momentsDemos.assetPaths) {
    const file = path.join(vaultRoot, asset);
    assert.equal(fs.statSync(file).isFile(), true);
    assert.deepEqual([...fs.readFileSync(file).subarray(0, 3)], [0xff, 0xd8, 0xff]);
  }
  assert.equal(fs.existsSync(path.join(vaultRoot, ".animelist-test-moments-v5")), true);
  assert.equal(fs.existsSync(path.join(vaultRoot, ".animelist-test-moments-v4")), false);
  assert.equal(fs.existsSync(path.join(vaultRoot, ".animelist-test-moments-v3")), false);
  assert.equal(fs.existsSync(path.join(vaultRoot, ".animelist-test-moments-v2")), false);
  assert.equal(fs.existsSync(path.join(vaultRoot, ".animelist-test-image-sections-v7")), true);
  assert.equal(fs.existsSync(path.join(vaultRoot, ".animelist-test-image-sections-v6")), false);
  for (const demo of first.imageSectionDemos.demoPaths) assert.equal(fs.statSync(demo).isFile(), true);
  for (const asset of first.imageSectionDemos.assetPaths) {
    const file = path.join(vaultRoot, asset);
    assert.equal(fs.statSync(file).isFile(), true);
    assert.deepEqual([...fs.readFileSync(file).subarray(0, 3)], [0xff, 0xd8, 0xff]);
  }
  assert.ok(first.imageSectionDemos.assetPaths.every((asset) => /^AnimeList\/Images\/test-vault\/anime-scenes\/(?:frieren-ep01|kaguya-s1-ep01)-/.test(asset)));
  const frierenAnimePath = "AnimeList/Anime/葬送的芙莉蓮.md";
  const kaguyaAnimePath = "AnimeList/Anime/輝夜姬想讓人告白~天才們的戀愛頭腦戰~.md";
  const overlordPath = "AnimeList/Novel/OVERLORD.md";
  assert.equal((read(frierenAnimePath).match(/^- AnimeList\/Images\/test-vault\/anime-scenes\/frieren-ep01-\d{2}\.jpg$/gm) ?? []).length, 10);
  assert.match(read(frierenAnimePath), /animelist-test-image-sections:start/);
  assert.match(read(frierenAnimePath), /animelist-test-moments:start/);
  assert.equal((read(frierenAnimePath).match(/```animelist-moments/g) ?? []).length, 2);
  assert.equal((read(frierenAnimePath).match(/^  - id: "m_test_frieren_/gm) ?? []).length, 6);
  assert.match(read(frierenAnimePath), /m_test_frieren_journey_02[\s\S]*AnimeList\/Images\/test-vault\/anime-scenes\/frieren-ep01-/);
  assert.match(read(frierenAnimePath), /m_test_frieren_promise_04[\s\S]*source: "第 1 話"[\s\S]*position: "旅途的記憶"[\s\S]*speaker: "芙莉蓮"[\s\S]*tags:[\s\S]*回憶片段[\s\S]*辛美爾/);
  assert.match(read(frierenAnimePath), /m_test_frieren_long_06[\s\S]*長文字排版[\s\S]*Test Vault[^\n]*長文字[^\n]*regression/);
  assert.equal((read(kaguyaAnimePath).match(/```animelist-images/g) ?? []).length, 2);
  assert.equal((read(kaguyaAnimePath).match(/```animelist-moments/g) ?? []).length, 1);
  assert.equal((read(kaguyaAnimePath).match(/^  - id: "m_test_kaguya_/gm) ?? []).length, 2);
  assert.match(read(kaguyaAnimePath), /AnimeList\/Images\/test-vault\/anime-scenes\/kaguya-s1-ep01-/);
  assert.match(read(kaguyaAnimePath), /m_test_kaguya_01[\s\S]*source: "第 1 話"[\s\S]*tags:[\s\S]*戀愛[\s\S]*頭腦戰/);
  assert.equal((read(kaguyaAnimePath).match(/^- AnimeList\/Images\/test-vault\/anime-scenes\/kaguya-s1-ep01-\d{2}\.jpg$/gm) ?? []).length, 3);
  assert.match(read(overlordPath), /```animelist-images\n```/);
  for (const demoPath of [frierenAnimePath, kaguyaAnimePath]) {
    assert.doesNotMatch(read(demoPath), /!\[\[AnimeList\/Covers\/(?:anime|manga|novel)\//);
  }
  assert.match(read(overlordPath), /!\[\[AnimeList\/Covers\/novel\/overlord-bangumi-101929\.jpg\|260\]\]/);
  assert.equal(fs.existsSync(path.join(vaultRoot, "_AnimeList Image Section Demos")), false);

  const mediaNotes = allMarkdown(path.join(vaultRoot, TEST_LIBRARY_ROOT))
    .filter((file) => fs.readFileSync(file, "utf8").includes(`fixture_version: ${TEST_FIXTURE_VERSION}`));
  assert.equal(mediaNotes.length, 18);
  const allFixtures = mediaNotes.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(allFixtures, /title: "(?:TEST|SPECIAL)/);
  assert.doesNotMatch(allFixtures, /source_provider: "mangadex"/);
  assert.equal((allFixtures.match(/schema_version: 6/g) ?? []).length, 18);
  assert.equal((allFixtures.match(/source_provider: "bangumi"/g) ?? []).length, 18);
  assert.equal((allFixtures.match(/anilist_id: "\d+"/g) ?? []).length, 5);
  assert.equal((allFixtures.match(new RegExp(`fixture_version: ${TEST_FIXTURE_VERSION}`, "g")) ?? []).length, 18);
  assert.equal((allFixtures.match(/cover: "AnimeList\/Covers\/(?:anime|manga|novel)\//g) ?? []).length, 18);
  assert.equal((allFixtures.match(/cover_remote: "https:\/\/lain\.bgm\.tv\/pic\/cover\/l\//g) ?? []).length, 18);
  assert.equal((allFixtures.match(/!\[\[AnimeList\/Covers\/(?:anime|manga|novel)\//g) ?? []).length, 1);

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
  assert.match(frierenManga, /anilist_id: "118586"/);
  assert.match(frierenManga, /cover: "AnimeList\/Covers\/manga\/葬送的芙莉蓮-bangumi-305429\.jpg"/);

  for (const [bangumiId, anilistId] of RELEASE_TRACKING_MANGA_ANILIST_IDS) {
    const matches = mediaNotes.filter((file) => {
      const content = fs.readFileSync(file, "utf8");
      return content.includes(`source_id: "${bangumiId}"`);
    });
    assert.equal(matches.length, 1, `Bangumi ${bangumiId} must identify exactly one controlled manga fixture`);
    assert.match(fs.readFileSync(matches[0], "utf8"), new RegExp(`anilist_id: "${anilistId}"`));
  }

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
  const imageDemoPath = kaguyaAnimePath;
  fs.appendFileSync(path.join(vaultRoot, imageDemoPath), "\nIMAGE SECTION DEMO EDIT MUST SURVIVE\nMOMENTS DEMO EDIT MUST SURVIVE\n");

  fetchCalls = 0;
  const second = await prepareTestFixtures(vaultRoot, { reset: false, fetchImpl: fakeFetch });
  const secondReleaseTracking = applyReleaseTrackingTestFixtureMetadata(second);
  assert.deepEqual(secondReleaseTracking, { updated: 0, verified: 4 });
  assert.equal(second.created, 0);
  assert.equal(second.repaired, 0);
  assert.equal(second.reused, 18);
  assert.equal(second.reusedBySource, 1);
  assert.equal(second.coversDownloaded, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(fs.existsSync(path.join(vaultRoot, frierenMangaPath)), false);
  assert.match(read(importedFrierenPath), /USER-COLLECTED NOTE MUST SURVIVE/);
  assert.match(read(alyaPath), /USER EDIT MUST SURVIVE/);
  assert.match(read(imageDemoPath), /IMAGE SECTION DEMO EDIT MUST SURVIVE/);
  assert.match(read(imageDemoPath), /MOMENTS DEMO EDIT MUST SURVIVE/);
  const frierenSourceMatches = allMarkdown(path.join(vaultRoot, "AnimeList", "Manga"))
    .filter((file) => /source_id: "305429"/.test(fs.readFileSync(file, "utf8")));
  assert.equal(frierenSourceMatches.length, 1);

  const alyaCover = path.join(vaultRoot, "AnimeList/Covers/novel/不時以俄語遮羞的艾莉同學-bangumi-339092.jpg");
  fs.rmSync(alyaCover);
  fetchCalls = 0;
  const repairedCover = await prepareTestFixtures(vaultRoot, { reset: false, fetchImpl: fakeFetch });
  const repairedReleaseTracking = applyReleaseTrackingTestFixtureMetadata(repairedCover);
  assert.deepEqual(repairedReleaseTracking, { updated: 0, verified: 4 });
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
  const resetReleaseTracking = applyReleaseTrackingTestFixtureMetadata(reset);
  assert.deepEqual(resetReleaseTracking, { updated: 4, verified: 4 });
  assert.equal(reset.files.length, 18);
  assert.equal(fs.existsSync(unrelated), true);
  assert.equal(fs.existsSync(path.join(vaultRoot, frierenMangaPath)), false);
  assert.match(read(importedFrierenPath), /USER-COLLECTED NOTE MUST SURVIVE/);
  assert.doesNotMatch(read(alyaPath), /USER EDIT MUST SURVIVE/);
  assert.doesNotMatch(read(imageDemoPath), /IMAGE SECTION DEMO EDIT MUST SURVIVE/);
  assert.doesNotMatch(read(imageDemoPath), /MOMENTS DEMO EDIT MUST SURVIVE/);
  assert.equal(reset.repaired, 17);
  assert.equal(reset.reused, 1);
  assert.equal(reset.reusedBySource, 1);

  console.log("Shared Test Vault mirrors collected media: current schema, real local covers, source-ID reuse, legacy fixture cleanup, non-destructive startup, explicit reset.");
} finally {
  fs.rmSync(vaultRoot, { recursive: true, force: true });
}
