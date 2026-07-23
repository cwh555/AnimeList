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
  lines.push(`year: ${yamlScalar(item.year ?? 2026)}`);
  lines.push("genres:", "  - 測試資料");
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
  lines.push("---", "", `# ${item.title}`, "", "```animelist-detail", "```", "", "> Generated test fixture. Changes are discarded the next time fixtures are reset.");
  return lines.join("\n");
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
];

function checklistContent() {
  return `# AnimeList Test Checklist

> [!warning]
> This file and everything under \`${TEST_FIXTURE_ROOT}\` are generated locally. Run \`npm run test-vault:fixtures\` to restore the baseline fixtures.

## 1. Library and progress bars

The library below already contains every status needed for visual verification. Switch it to **list view once** and verify that every progress track reaches the available card width.

\`\`\`animelist
source: ${TEST_FIXTURE_ROOT}
\`\`\`

Expected manga and novel state tracks:

- Planned: empty track and no redundant not-started sentence.
- Reading, on hold, and dropped: half track.
- Completed: full track.
- Anime continues to use its numeric progress ratio.

## 2. Novel add-volume flow and date layout

Open [[${TEST_FIXTURE_ROOT}/Novel/10-novel-add-volume|TEST 小說－新增卷數與日期排版]], click **Edit**, and verify:

- The volume editor spans the full modal width.
- Volume, started date, and completed date use the horizontal space clearly.
- **Add volume** stays below the existing rows.
- Adding the next volume creates volume 15 and keeps the new row visible.

## 3. Direct status fixtures

### Manga

- [[${TEST_FIXTURE_ROOT}/Manga/04-manga-planned|Planned]]
- [[${TEST_FIXTURE_ROOT}/Manga/05-manga-reading|Reading]]
- [[${TEST_FIXTURE_ROOT}/Manga/06-manga-on-hold|On hold]]
- [[${TEST_FIXTURE_ROOT}/Manga/07-manga-dropped|Dropped]]
- [[${TEST_FIXTURE_ROOT}/Manga/08-manga-completed|Completed]]

### Novel

- [[${TEST_FIXTURE_ROOT}/Novel/09-novel-planned|Planned]]
- [[${TEST_FIXTURE_ROOT}/Novel/10-novel-add-volume|Reading and add-volume target]]
- [[${TEST_FIXTURE_ROOT}/Novel/11-novel-on-hold|On hold]]
- [[${TEST_FIXTURE_ROOT}/Novel/12-novel-dropped|Dropped]]
- [[${TEST_FIXTURE_ROOT}/Novel/13-novel-completed|Completed]]
`;
}

export function prepareTestFixtures(vaultRoot) {
  const resolvedVault = path.resolve(vaultRoot);
  const fixtureRoot = path.join(resolvedVault, TEST_FIXTURE_ROOT);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(fixtureRoot, { recursive: true });

  const files = FIXTURES.map((fixture) => writeFile(
    resolvedVault,
    path.join(TEST_FIXTURE_ROOT, fixture.folder, fixture.file),
    mediaNote(fixture),
  ));
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
