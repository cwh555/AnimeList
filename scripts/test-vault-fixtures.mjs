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

function yamlArray(lines, key, values) {
  const clean = [...new Set((values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))];
  if (!clean.length) return;
  lines.push(`${key}:`);
  for (const value of clean) lines.push(`  - ${yamlScalar(value)}`);
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
  ];
  if (item.originalTitle) lines.push(`title_original: ${yamlScalar(item.originalTitle)}`);
  if (item.romajiTitle) lines.push(`title_romaji: ${yamlScalar(item.romajiTitle)}`);
  lines.push(
    `media_type: ${yamlScalar(item.mediaType)}`,
    `format: ${yamlScalar(item.format)}`,
    `status: ${yamlScalar(item.status)}`,
  );
  if (item.mediaType !== "anime") lines.push(`release_status: ${yamlScalar(item.releaseStatus)}`);
  lines.push(`progress: ${yamlScalar(item.progress)}`);
  if (item.mediaType === "anime") lines.push(`progress_total: ${yamlScalar(item.total ?? 0)}`);
  lines.push(`progress_unit: ${yamlScalar(item.unit)}`);
  if (item.score != null) lines.push(`score: ${yamlScalar(item.score)}`);
  lines.push(`favorite: ${yamlScalar(Boolean(item.favorite))}`);
  if (item.masterpieceLabels?.length) {
    lines.push("masterpiece_labels:");
    for (const label of item.masterpieceLabels) lines.push(`  - ${yamlScalar(label)}`);
  }
  lines.push(`fixture_case: ${yamlScalar(item.fixtureCase)}`);
  if (item.preservationMarker) lines.push(`fixture_preservation_marker: ${yamlScalar(item.preservationMarker)}`);
  lines.push(`year: ${yamlScalar(item.year)}`);
  yamlArray(lines, "genres", item.genres);
  yamlArray(lines, "title_aliases", item.aliases);
  if (item.mediaType === "anime") yamlArray(lines, "studios", item.people);
  else yamlArray(lines, "authors", item.people);
  if (item.sourceProvider && item.sourceId) {
    lines.push(`source_provider: ${yamlScalar(item.sourceProvider)}`);
    lines.push(`source_id: ${yamlScalar(item.sourceId)}`);
    yamlArray(lines, "source_urls", item.sourceUrls);
  }
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
    item.preservationMarker
      ? `> PRESERVE BODY: ${item.preservationMarker}`
      : "> Shared Test Vault fixture based on a real work. Reading status/progress/dates are controlled test scenarios and are reset with the fixture generator.",
  );
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

const MANGADEX = {
  frieren: "b0b721ff-c388-4486-aa0f-c2b0bb321512",
  grandBlue: "fffbfac3-b7ad-41ee-9581-b4d90ecec941",
  iruma: "d7037b2a-874a-4360-8a7b-07f2899152fd",
  mieruko: "6670ee28-f26d-4b61-b49c-d71149cd5a6e",
  kaguya: "37f5cce0-8070-4ada-96e5-fa24b1bd4ff9",
  blueLock: "4141c5dc-c525-4df5-afd7-cc7d192a832f",
};

function mangaDexSource(id) {
  return {
    sourceProvider: "mangadex",
    sourceId: id,
    sourceUrls: [`https://mangadex.org/title/${id}`],
  };
}

const FIXTURES = [
  {
    folder: "Anime", file: "01-anime-planned.md", fixtureCase: "anime-planned",
    title: "葬送的芙莉蓮", originalTitle: "葬送のフリーレン", romajiTitle: "Sousou no Frieren",
    aliases: ["Frieren: Beyond Journey's End"], mediaType: "anime", format: "tv", status: "planned",
    progress: 0, total: 28, unit: "episode", year: 2023, genres: ["奇幻", "冒險"], people: ["MADHOUSE"],
  },
  {
    folder: "Anime", file: "02-anime-watching.md", fixtureCase: "anime-watching",
    title: "孤獨搖滾！", originalTitle: "ぼっち・ざ・ろっく！", romajiTitle: "Bocchi the Rock!",
    mediaType: "anime", format: "tv", status: "watching", progress: 5, total: 12, unit: "episode",
    year: 2022, genres: ["音樂", "喜劇"], people: ["CloverWorks"], startedAt: "2026-07-01",
  },
  {
    folder: "Anime", file: "03-anime-completed.md", fixtureCase: "anime-completed",
    title: "輝夜姬想讓人告白～天才們的戀愛頭腦戰～", originalTitle: "かぐや様は告らせたい～天才たちの恋愛頭脳戦～",
    romajiTitle: "Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen", mediaType: "anime", format: "tv",
    status: "completed", progress: 12, total: 12, unit: "episode", score: 8.5, year: 2019,
    genres: ["戀愛", "喜劇", "校園"], people: ["A-1 Pictures"], startedAt: "2026-06-01", completedAt: "2026-06-12",
  },

  {
    folder: "Manga", file: "04-manga-planned.md", fixtureCase: "manga-planned",
    title: "葬送的芙莉蓮", originalTitle: "葬送のフリーレン", romajiTitle: "Sousou no Frieren",
    mediaType: "manga", format: "manga", status: "planned", releaseStatus: "releasing", progress: 0, unit: "chapter",
    year: 2020, genres: ["奇幻", "冒險"], people: ["山田鐘人", "アベツカサ"], ...mangaDexSource(MANGADEX.frieren),
  },
  {
    folder: "Manga", file: "05-manga-reading.md", fixtureCase: "manga-reading",
    title: "碧藍之海", originalTitle: "ぐらんぶる", romajiTitle: "Grand Blue",
    mediaType: "manga", format: "manga", status: "reading", releaseStatus: "releasing", progress: 50, unit: "chapter",
    year: 2014, genres: ["喜劇", "校園"], people: ["井上堅二", "吉岡公威"], startedAt: "2026-07-03",
    ...mangaDexSource(MANGADEX.grandBlue),
  },
  {
    folder: "Manga", file: "06-manga-on-hold.md", fixtureCase: "manga-on-hold",
    title: "入間同學入魔了", originalTitle: "魔入りました！入間くん", romajiTitle: "Mairimashita! Iruma-kun",
    mediaType: "manga", format: "manga", status: "on_hold", releaseStatus: "releasing", progress: 120, unit: "chapter",
    year: 2017, genres: ["奇幻", "喜劇", "校園"], people: ["西修"], startedAt: "2026-05-01",
    ...mangaDexSource(MANGADEX.iruma),
  },
  {
    folder: "Manga", file: "07-manga-dropped.md", fixtureCase: "manga-dropped",
    title: "陰陽眼見子", originalTitle: "見える子ちゃん", romajiTitle: "Mieruko-chan",
    mediaType: "manga", format: "manga", status: "dropped", releaseStatus: "releasing", progress: 20, unit: "chapter",
    year: 2018, genres: ["恐怖", "喜劇"], people: ["泉朝樹"], startedAt: "2026-04-01",
    ...mangaDexSource(MANGADEX.mieruko),
  },
  {
    folder: "Manga", file: "08-manga-completed.md", fixtureCase: "manga-completed",
    title: "輝夜姬想讓人告白～天才們的戀愛頭腦戰～", originalTitle: "かぐや様は告らせたい～天才たちの恋愛頭脳戦～",
    romajiTitle: "Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen", mediaType: "manga", format: "manga",
    status: "completed", releaseStatus: "finished", progress: "281.1", unit: "chapter", score: 9, year: 2015,
    genres: ["戀愛", "喜劇", "校園"], people: ["赤坂アカ"], startedAt: "2026-01-01", completedAt: "2026-05-30",
    ...mangaDexSource(MANGADEX.kaguya),
  },

  {
    folder: "Novel", file: "09-novel-planned.md", fixtureCase: "novel-planned",
    title: "三坪房間的侵略者！？", originalTitle: "六畳間の侵略者!?", romajiTitle: "Rokujouma no Shinryakusha!?",
    mediaType: "novel", format: "light_novel", status: "planned", releaseStatus: "releasing", progress: 0, unit: "volume",
    year: 2009, genres: ["奇幻", "戀愛", "喜劇"], people: ["健速"],
  },
  {
    folder: "Novel", file: "10-novel-add-volume.md", fixtureCase: "novel-add-volume",
    title: "不時以俄語遮羞的艾莉同學", originalTitle: "時々ボソッとロシア語でデレる隣のアーリャさん",
    romajiTitle: "Tokidoki Bosotto Russia-go de Dereru Tonari no Alya-san", mediaType: "novel", format: "light_novel",
    status: "reading", releaseStatus: "releasing", progress: 8, unit: "volume", year: 2021,
    genres: ["戀愛", "校園", "喜劇"], people: ["燦々SUN"], startedAt: "2026-06-01", volumeLog: completedVolumes(8),
  },
  {
    folder: "Novel", file: "11-novel-on-hold.md", fixtureCase: "novel-on-hold",
    title: "不正經的魔術講師與禁忌教典", originalTitle: "ロクでなし魔術講師と禁忌教典",
    romajiTitle: "Rokudenashi Majutsu Koushi to Akashic Records", mediaType: "novel", format: "light_novel",
    status: "on_hold", releaseStatus: "finished", progress: 12, unit: "volume", year: 2014,
    genres: ["奇幻", "校園"], people: ["羊太郎"], startedAt: "2026-02-01", volumeLog: completedVolumes(12),
  },
  {
    folder: "Novel", file: "12-novel-dropped.md", fixtureCase: "novel-dropped",
    title: "OVERLORD", originalTitle: "オーバーロード", romajiTitle: "Overlord",
    mediaType: "novel", format: "light_novel", status: "dropped", releaseStatus: "releasing", progress: 8, unit: "volume",
    year: 2012, genres: ["奇幻", "異世界"], people: ["丸山くがね"], startedAt: "2026-01-02", volumeLog: completedVolumes(8),
  },
  {
    folder: "Novel", file: "13-novel-completed.md", fixtureCase: "novel-completed",
    title: "虎與龍", originalTitle: "とらドラ!", romajiTitle: "Toradora!",
    mediaType: "novel", format: "light_novel", status: "completed", releaseStatus: "finished", progress: 10, unit: "volume",
    score: 9, year: 2006, genres: ["戀愛", "校園", "喜劇"], people: ["竹宮ゆゆこ"],
    startedAt: "2026-01-01", completedAt: "2026-03-01", volumeLog: completedVolumes(10),
  },

  {
    folder: "Special", file: "14-special-legacy-favorite-completed.md", fixtureCase: "legacy-favorite-completed",
    title: "命運石之門", originalTitle: "STEINS;GATE", romajiTitle: "Steins;Gate",
    mediaType: "anime", format: "tv", status: "completed", progress: 24, total: 24, unit: "episode", score: 9.5,
    favorite: true, year: 2011, genres: ["科幻", "懸疑"], people: ["WHITE FOX"], completedAt: "2026-07-01",
    preservationMarker: "legacy-favorite-completed",
  },
  {
    folder: "Special", file: "15-special-multi-label-ongoing.md", fixtureCase: "multi-label-ongoing",
    title: "ONE PIECE", originalTitle: "ONE PIECE", romajiTitle: "One Piece",
    mediaType: "anime", format: "tv", status: "ongoing", progress: 1100, total: 0, unit: "episode", favorite: true,
    masterpieceLabels: ["年度", "長篇"], year: 1999, genres: ["冒險", "奇幻"], people: ["東映アニメーション"],
    preservationMarker: "multi-label-ongoing",
  },
  {
    folder: "Special", file: "16-special-shared-label-planned.md", fixtureCase: "shared-label-planned",
    title: "BLUE LOCK 藍色監獄", originalTitle: "ブルーロック", romajiTitle: "Blue Lock",
    mediaType: "manga", format: "manga", status: "planned", releaseStatus: "releasing", progress: 0, unit: "chapter",
    favorite: true, masterpieceLabels: ["年度"], year: 2018, genres: ["運動", "競技"], people: ["金城宗幸", "ノ村優介"],
    preservationMarker: "shared-label-planned", ...mangaDexSource(MANGADEX.blueLock),
  },
  {
    folder: "Special", file: "17-special-retained-label-completed.md", fixtureCase: "retained-label-completed",
    title: "果然我的青春戀愛喜劇搞錯了。", originalTitle: "やはり俺の青春ラブコメはまちがっている。",
    romajiTitle: "Yahari Ore no Seishun Love Comedy wa Machigatteiru.", mediaType: "novel", format: "light_novel",
    status: "completed", releaseStatus: "finished", progress: 14, unit: "volume", favorite: false, masterpieceLabels: ["青春"],
    score: 8.5, year: 2011, genres: ["戀愛", "校園"], people: ["渡航"], completedAt: "2026-07-02",
    volumeLog: completedVolumes(14), preservationMarker: "retained-label-completed",
  },
  {
    folder: "Special", file: "18-special-control-planned.md", fixtureCase: "control-planned",
    title: "86－不存在的戰區－", originalTitle: "86―エイティシックス―", romajiTitle: "86: Eighty-Six",
    mediaType: "anime", format: "tv", status: "planned", progress: 0, total: 23, unit: "episode", favorite: false,
    year: 2021, genres: ["科幻", "戰爭"], people: ["A-1 Pictures"], preservationMarker: "control-planned",
  },
];

function checklistContent() {
  return `# AnimeList Test Checklist

> [!warning]
> This file and everything under \`${TEST_FIXTURE_ROOT}\` are generated locally. The works are real; user status/progress/dates are controlled test scenarios. Run \`npm run test-vault:fixtures\` to restore the baseline fixtures.

## 1. Shared fixture sanity

Use the full shared library below. It contains **18 real works** across anime, manga, and novels.

\`\`\`animelist
source: ${TEST_FIXTURE_ROOT}
\`\`\`

Check that titles, original titles, genres, studios/authors, status, score, progress, and media-type filters render normally. The fixture titles must not contain synthetic \`TEST\` / \`SPECIAL\` names.

## 2. Favorite list: shared single-selection behavior

Use this five-work control subset:

\`\`\`animelist
source: ${TEST_FIXTURE_ROOT}/Special
\`\`\`

Expected fixed counts:

- All: **5** titles.
- Favorite: **3** titles (命運石之門, ONE PIECE, BLUE LOCK 藍色監獄).
- Completed: **2** titles (命運石之門, 果然我的青春戀愛喜劇搞錯了。).
- Wishlist: **2** titles (BLUE LOCK 藍色監獄, 86－不存在的戰區－).
- Ongoing: **1** title (ONE PIECE).

Selection check:

1. Click **Completed**, then **Favorite**, then **Wishlist**.
2. After every click, exactly one list button must be active.
3. The active button must show the expected count above; no previous button may remain active.
4. Favorite must include the three works listed above even though their statuses/media types differ.
5. Type, genre, search, sort, and view controls must continue to work while Favorite is selected.

## 3. Favorite / Masterpiece compatibility

Keep **Special label mode = Favorite** first.

- 命運石之門 is a legacy \`favorite: true\` note with no \`masterpiece_labels\`; it must still appear in Favorite.
- Toggle the star on 86－不存在的戰區－ on, then off. Favorite count must change **3 → 4 → 3**.
- 果然我的青春戀愛喜劇搞錯了。 is not favorite even though its custom \`masterpiece_labels\` value exists.

Switch **Special label mode = Masterpiece**.

- Settings must show only the Favorite/Masterpiece mode selector. It must not show category inventory, rename, delete, or add controls.
- 命運石之門 remains included under the virtual default \`masterpiece\` category.
- ONE PIECE appears in **年度** and **長篇**; BLUE LOCK 藍色監獄 reuses **年度**.
- Click 86－不存在的戰區－'s star. The category modal must show existing categories and the new-category input on the same operation surface.
- The **新增類別** label must sit directly above its full-width input without a large horizontal gap.
- The modal must not contain a separate **移除 masterpiece** button.
- Select two categories and save, then reopen and uncheck every category. The unique masterpiece count must return to 3.
- Switch Masterpiece → Favorite → Masterpiece. ONE PIECE and BLUE LOCK 藍色監獄 must retain their categories.

## 4. Edit modal / progress / preservation

- Open 86－不存在的戰區－ and click **Edit** while Masterpiece mode is active. The edit modal must show **加入 masterpiece** or **編輯 masterpiece**, not the Favorite checkbox.
- After changing categories, save an unrelated edit field and confirm the category selection is not overwritten.
- Confirm every \`fixture_preservation_marker\` and every \`PRESERVE BODY\` line remains unchanged after category operations.
- Switch the library to list view once and verify progress tracks still use the available card width.
- Open [[${TEST_FIXTURE_ROOT}/Novel/10-novel-add-volume|不時以俄語遮羞的艾莉同學]], click **Edit**, add volume 9, and verify the new row remains visible and uses the modal width.

## 5. Release Tracking live-provider check

In Settings enable **Fetch latest release information**, keep daily automatic checks off, then press **Check updates**.

Manga fixtures that should normally auto-match by exact original title (API values may advance after this checklist was generated):

- 葬送的芙莉蓮 / 葬送のフリーレン — live probe 2026-08-08: MangaDex Ch.145.
- 碧藍之海 / ぐらんぶる — Ch.108.
- 入間同學入魔了 / 魔入りました！入間くん — Ch.454.
- 陰陽眼見子 / 見える子ちゃん — Ch.72.
- 輝夜姬想讓人告白 / かぐや様は告らせたい～天才たちの恋愛頭脳戦～ — original edition selected over colored variants; Ch.281.1.

Novel fixtures that should normally auto-resolve the main publication line using original title + author + imprint evidence:

- 三坪房間的侵略者！？ / 六畳間の侵略者!? / 健速 — live probe: HJ文庫, Vol.49.
- 不時以俄語遮羞的艾莉同學 / 燦々SUN — 角川スニーカー文庫, Vol.11.
- 不正經的魔術講師與禁忌教典 / 羊太郎 — 富士見ファンタジア文庫, Vol.24.
- OVERLORD / 丸山くがね — original novel line, Vol.16.

Check behavior rather than freezing the numeric value: safe works should not all require manual source selection; a genuinely ambiguous/unmatched work must still report uncertainty instead of guessing. Latest metadata must remain separate from reading progress.

## 6. Release Tracking result UI

After **Check updates**:

- Only the Release Tracking result/source-confirmation modal should use the new layout; the Library, cards, toolbar, and Detail layout must remain unchanged.
- The result modal should show summary cards for updated / unchanged / needs review.
- Updated rows should show before → after and source.
- Needs-review rows should be visually distinct and explain why nothing was overwritten.
- Unchanged items should be collapsed by default.
- The footer must state that release metadata is updated without changing reading progress.

Run \`npm run test-vault:fixtures\` afterward to restore all generated notes.
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
