import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const TEST_FIXTURE_ROOT = "AnimeList/Test Fixtures";
export const TEST_CHECKLIST_PATH = "_AnimeList Test Checklist.md";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

function yamlScalar(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(String(value ?? ""));
}

function writeFile(vaultRoot, relativePath, content) {
  const target = path.join(vaultRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${content.trim()}\n`);
  return target;
}

function mediaNote(item) {
  const lines = [
    "---",
    "schema_version: 5",
    "animelist_test_fixture: true",
    `title: ${yamlScalar(item.title)}`,
    `media_type: ${yamlScalar(item.mediaType)}`,
    `format: ${yamlScalar(item.format)}`,
    `status: ${yamlScalar(item.status)}`,
    `release_status: ${yamlScalar(item.releaseStatus)}`,
    `progress: ${yamlScalar(item.progress)}`,
  ];

  if (item.total != null) lines.push(`progress_total: ${yamlScalar(item.total)}`);
  lines.push(`progress_unit: ${yamlScalar(item.unit)}`);
  if (item.score != null) lines.push(`score: ${yamlScalar(item.score)}`);
  lines.push(`favorite: ${yamlScalar(Boolean(item.favorite))}`);
  if (item.masterpieceLabels?.length) {
    lines.push("masterpiece_labels:");
    for (const label of item.masterpieceLabels) lines.push(`  - ${yamlScalar(label)}`);
  }
  if (item.preservationMarker) lines.push(`fixture_preservation_marker: ${yamlScalar(item.preservationMarker)}`);
  lines.push(`year: ${yamlScalar(item.year ?? 2026)}`);
  lines.push("genres:", `  - ${yamlScalar(item.genre ?? "測試資料")}`);
  if (item.startedAt) lines.push(`started_at: ${yamlScalar(item.startedAt)}`);
  if (item.completedAt) lines.push(`completed_at: ${yamlScalar(item.completedAt)}`);
  if (item.volumeLog?.length) {
    lines.push("volume_log:");
    for (const volume of item.volumeLog) {
      lines.push(`  - label: ${yamlScalar(volume.label)}`);
      if (volume.startedAt) lines.push(`    started_at: ${yamlScalar(volume.startedAt)}`);
      if (volume.completedAt) lines.push(`    completed_at: ${yamlScalar(volume.completedAt)}`);
    }
  }
  lines.push(
    "---",
    "",
    `# ${item.title}`,
    "",
    "```animelist-detail",
    "```",
    "",
    item.preservationMarker ? `> PRESERVE BODY: ${item.preservationMarker}` : "> Generated test fixture. Changes are discarded the next time fixtures are reset.",
  );
  return lines.join("\n");
}

function classificationLegacyNote(item) {
  return [
    "---",
    "schema_version: 5",
    `title: ${yamlScalar(item.title)}`,
    `title_original: ${yamlScalar(item.originalTitle)}`,
    `title_romaji: ${yamlScalar(item.romajiTitle)}`,
    `media_type: ${yamlScalar(item.mediaType)}`,
    `format: ${yamlScalar(item.format)}`,
    "status: planned",
    "progress: 0",
    `progress_total: ${yamlScalar(item.total)}`,
    "progress_unit: episode",
    "favorite: false",
    `year: ${yamlScalar(item.year)}`,
    "genres:",
    "  - TV",
    `source_provider: ${yamlScalar("anilist")}`,
    `source_id: ${yamlScalar(item.sourceId)}`,
    "source_urls:",
    `  - ${yamlScalar(item.sourceUrl)}`,
    `fixture_preservation_marker: ${yamlScalar(item.marker)}`,
    "---",
    "",
    `# ${item.title}`,
    "",
    "```animelist-detail",
    "```",
    "",
    `> PRESERVE BODY: ${item.marker}`,
  ].join("\n");
}

function completedVolumes(count) {
  return Array.from({ length: count }, (_, index) => {
    const volume = index + 1;
    const day = String(Math.min(28, volume + 1)).padStart(2, "0");
    return {
      label: String(volume),
      startedAt: `2026-06-${String(Math.min(28, volume)).padStart(2, "0")}`,
      completedAt: `2026-06-${day}`,
    };
  });
}

const FIXTURES = [
  { folder: "Anime", file: "01-anime-planned.md", title: "TEST 動畫－未開始", mediaType: "anime", format: "tv", status: "planned", releaseStatus: "finished", progress: 0, total: 12, unit: "episode" },
  { folder: "Anime", file: "02-anime-watching.md", title: "TEST 動畫－觀看中 5/12", mediaType: "anime", format: "tv", status: "watching", releaseStatus: "finished", progress: 5, total: 12, unit: "episode", startedAt: "2026-07-01" },
  { folder: "Anime", file: "03-anime-completed.md", title: "TEST 動畫－已完成 12/12", mediaType: "anime", format: "tv", status: "completed", releaseStatus: "finished", progress: 12, total: 12, unit: "episode", score: 8.5, startedAt: "2026-06-01", completedAt: "2026-06-12" },
  { folder: "Manga", file: "04-manga-planned.md", title: "TEST 漫畫－未開始空進度條", mediaType: "manga", format: "manga", status: "planned", releaseStatus: "releasing", progress: 0, unit: "chapter" },
  { folder: "Manga", file: "05-manga-reading.md", title: "TEST 漫畫－閱讀中半滿進度條", mediaType: "manga", format: "manga", status: "reading", releaseStatus: "releasing", progress: 37, unit: "chapter", startedAt: "2026-07-03" },
  { folder: "Manga", file: "06-manga-on-hold.md", title: "TEST 漫畫－擱置半滿進度條", mediaType: "manga", format: "manga", status: "on_hold", releaseStatus: "hiatus", progress: 12, unit: "chapter", startedAt: "2026-05-01" },
  { folder: "Manga", file: "07-manga-dropped.md", title: "TEST 漫畫－棄置半滿進度條", mediaType: "manga", format: "manga", status: "dropped", releaseStatus: "cancelled", progress: 8, unit: "chapter", startedAt: "2026-04-01" },
  { folder: "Manga", file: "08-manga-completed.md", title: "TEST 漫畫－已完成全滿進度條", mediaType: "manga", format: "manga", status: "completed", releaseStatus: "finished", progress: 88, unit: "chapter", score: 9, startedAt: "2026-01-01", completedAt: "2026-05-30" },
  { folder: "Novel", file: "09-novel-planned.md", title: "TEST 小說－未開始空進度條", mediaType: "novel", format: "light_novel", status: "planned", releaseStatus: "releasing", progress: 0, unit: "volume" },
  { folder: "Novel", file: "10-novel-add-volume.md", title: "TEST 小說－新增卷數與日期排版", mediaType: "novel", format: "light_novel", status: "reading", releaseStatus: "releasing", progress: 14, unit: "volume", startedAt: "2026-06-01", volumeLog: completedVolumes(14) },
  { folder: "Novel", file: "11-novel-on-hold.md", title: "TEST 小說－擱置半滿進度條", mediaType: "novel", format: "light_novel", status: "on_hold", releaseStatus: "hiatus", progress: 4, unit: "volume", startedAt: "2026-02-01", volumeLog: completedVolumes(4) },
  { folder: "Novel", file: "12-novel-dropped.md", title: "TEST 小說－棄置半滿進度條", mediaType: "novel", format: "light_novel", status: "dropped", releaseStatus: "cancelled", progress: 2, unit: "volume", startedAt: "2026-01-02", volumeLog: completedVolumes(2) },
  { folder: "Novel", file: "13-novel-completed.md", title: "TEST 小說－已完成全滿進度條", mediaType: "novel", format: "light_novel", status: "completed", releaseStatus: "finished", progress: 6, unit: "volume", score: 9.5, startedAt: "2026-01-01", completedAt: "2026-03-01", volumeLog: completedVolumes(6) },
  { folder: "Special", file: "14-special-legacy-favorite-completed.md", title: "SPECIAL 01－舊版最愛／已完成", mediaType: "anime", format: "tv", status: "completed", releaseStatus: "finished", progress: 12, total: 12, unit: "episode", score: 9, favorite: true, completedAt: "2026-07-01", genre: "SPECIAL 驗證", preservationMarker: "legacy-favorite-completed" },
  { folder: "Special", file: "15-special-multi-label-ongoing.md", title: "SPECIAL 02－多分類最愛／進行中", mediaType: "anime", format: "tv", status: "ongoing", releaseStatus: "releasing", progress: 4, total: 12, unit: "episode", favorite: true, masterpieceLabels: ["戀愛", "年度"], genre: "SPECIAL 驗證", preservationMarker: "multi-label-ongoing" },
  { folder: "Special", file: "16-special-shared-label-planned.md", title: "SPECIAL 03－共享分類最愛／願望清單", mediaType: "manga", format: "manga", status: "planned", releaseStatus: "releasing", progress: 0, unit: "chapter", favorite: true, masterpieceLabels: ["戀愛"], genre: "SPECIAL 驗證", preservationMarker: "shared-label-planned" },
  { folder: "Special", file: "17-special-retained-label-completed.md", title: "SPECIAL 04－非最愛保留分類／已完成", mediaType: "novel", format: "light_novel", status: "completed", releaseStatus: "finished", progress: 3, unit: "volume", favorite: false, masterpieceLabels: ["保留分類"], score: 8, completedAt: "2026-07-02", genre: "SPECIAL 驗證", preservationMarker: "retained-label-completed" },
  { folder: "Special", file: "18-special-control-planned.md", title: "SPECIAL 05－一般作品／願望清單", mediaType: "anime", format: "tv", status: "planned", releaseStatus: "finished", progress: 0, total: 12, unit: "episode", favorite: false, genre: "SPECIAL 驗證", preservationMarker: "control-planned" },
];

const CLASSIFICATION_FIXTURES = [
  { folder: "Classification", file: "01-cowboy-bebop-legacy.md", title: "Cowboy Bebop", originalTitle: "カウボーイビバップ", romajiTitle: "Cowboy Bebop", mediaType: "anime", format: "TV", total: 26, year: 1998, sourceId: "1", sourceUrl: "https://anilist.co/anime/1", marker: "classification-cowboy-bebop" },
  { folder: "Classification", file: "02-takagi-san-legacy.md", title: "擅長捉弄人的高木同學", originalTitle: "からかい上手の高木さん", romajiTitle: "Karakai Jouzu no Takagi-san", mediaType: "anime", format: "TV", total: 12, year: 2018, sourceId: "99468", sourceUrl: "https://anilist.co/anime/99468", marker: "classification-takagi-san" },
];

function checklistContent() {
  return `# AnimeList Test Checklist

> [!warning]
> This file and everything under \`${TEST_FIXTURE_ROOT}\` are generated locally. Run \`npm run test-vault:fixtures\` to restore the baseline fixtures.

## 1. Favorite list: shared single-selection behavior

Use the library below and search for **SPECIAL**. Keep the media type on **All**.

\`\`\`animelist
source: ${TEST_FIXTURE_ROOT}
\`\`\`

Expected fixed counts:

- All: **5** SPECIAL titles.
- Favorite: **3** titles.
- Completed: **2** titles.
- Wishlist: **2** titles.
- Ongoing: **1** title.

Selection check:

1. Click **Completed**, then **Favorite**, then **Wishlist**.
2. After every click, exactly one list button must be active.
3. The active button must show the expected count above; no previous button may remain active.
4. Favorite must include SPECIAL 01, 02, and 03 even though their statuses differ.
5. Type, genre, search, sort, and view controls must continue to work while Favorite is selected.

## 2. Favorite mode compatibility

Keep **Special label mode = Favorite** in AnimeList settings.

- SPECIAL 01 is a legacy \`favorite: true\` note with no \`masterpiece_labels\`; it must still appear in Favorite.
- Toggle the star on SPECIAL 05 on, then off. Favorite count must change **3 → 4 → 3**.
- Open SPECIAL 04 and confirm it is not favorite even though its custom \`masterpiece_labels\` value exists.

## 3. Masterpiece mode operation UI

Switch **Special label mode = Masterpiece** in AnimeList settings.

- Settings must show only the Favorite/Masterpiece mode selector. It must not show category inventory, rename, delete, or add controls.
- The list button changes to **masterpiece** but remains in the same row and remains mutually exclusive.
- SPECIAL 01 remains included under the virtual default \`masterpiece\` category.
- SPECIAL 02 appears in both **戀愛** and **年度**; SPECIAL 03 reuses **戀愛**.
- Click SPECIAL 05's star. The category modal must show existing categories and the new-category input on the same operation surface.
- The **新增類別** label must sit directly above its full-width input without a large horizontal gap.
- The modal must not contain a separate **移除 masterpiece** button.
- Select two categories and save. Confirm SPECIAL 05 appears in both sections.
- Open the same modal again, uncheck every category, and save. SPECIAL 05 must be removed from masterpiece and the unique count must return to 3.
- Switch Masterpiece → Favorite → Masterpiece. SPECIAL 02 and SPECIAL 03 must retain their categories.

## 4. Edit modal consistency

- Open SPECIAL 05 and click **Edit** while Masterpiece mode is active.
- The edit modal must show **加入 masterpiece** or **編輯 masterpiece**, not the Favorite checkbox.
- Clicking that control must open the same category modal described above.
- After changing categories, save an unrelated edit field and confirm the category selection is not overwritten.

## 5. Media classification cleanup

1. Open Settings → Media classification → Run cleanup.
2. The synthetic TEST and SPECIAL notes must be excluded from the cleanup total.
3. The cleanup modal must scan exactly the two real AniList legacy fixtures under \`${TEST_FIXTURE_ROOT}/Classification\`.
4. Both fixtures must appear under Updated, not Unresolved.
5. Open both notes and confirm \`genres\` no longer contains \`TV\`, canonical AniList classifications were written, and each \`PRESERVE BODY\` line remains unchanged.

## 6. Content preservation and existing regressions

- Confirm every \`fixture_preservation_marker\` and every \`PRESERVE BODY\` line remains unchanged after category operations.
- Switch the library to list view once and verify progress tracks still use the available card width.
- Open [[${TEST_FIXTURE_ROOT}/Novel/10-novel-add-volume|TEST 小說－新增卷數與日期排版]], click **Edit**, add volume 15, and verify the row remains visible and uses the modal width.
- Run \`npm run test-vault:fixtures\` afterward to restore all generated notes.
`;
}

export function prepareTestFixtures(vaultRoot) {
  const resolvedVault = path.resolve(vaultRoot);
  const fixtureRoot = path.join(resolvedVault, TEST_FIXTURE_ROOT);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(fixtureRoot, { recursive: true });

  const files = [
    ...FIXTURES.map((fixture) => writeFile(
      resolvedVault,
      path.join(TEST_FIXTURE_ROOT, fixture.folder, fixture.file),
      mediaNote(fixture),
    )),
    ...CLASSIFICATION_FIXTURES.map((fixture) => writeFile(
      resolvedVault,
      path.join(TEST_FIXTURE_ROOT, fixture.folder, fixture.file),
      classificationLegacyNote(fixture),
    )),
  ];
  const checklistPath = writeFile(resolvedVault, TEST_CHECKLIST_PATH, checklistContent());
  return { fixtureRoot, checklistPath, files };
}

function defaultVaultRoot() {
  return path.resolve(process.env.ANIMELIST_TEST_VAULT || path.join(repoRoot, "test-vault"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const result = prepareTestFixtures(defaultVaultRoot());
  console.log(`AnimeList test fixtures reset: ${result.fixtureRoot}`);
  console.log(`Checklist: ${result.checklistPath}`);
}
