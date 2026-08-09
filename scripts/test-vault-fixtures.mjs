import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const TEST_LIBRARY_ROOT = "AnimeList";
export const TEST_CHECKLIST_PATH = "_AnimeList Test Checklist.md";
export const TEST_FIXTURE_VERSION = 2;

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

function sanitizePathPart(value, fallback = "untitled") {
  const cleaned = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|#[\]^]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 90);
  return cleaned || fallback;
}

function slugify(value, fallback = "media") {
  return sanitizePathPart(value, fallback)
    .toLocaleLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || fallback;
}

function writeFile(vaultRoot, relativePath, content) {
  const target = path.join(vaultRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${content.trim()}\n`);
  return target;
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

function bangumiSource(id, coverRemote) {
  return {
    sourceProvider: "bangumi",
    sourceId: String(id),
    sourceUrls: [`https://bgm.tv/subject/${id}`],
    coverRemote,
  };
}

const FIXTURES = [
  {
    folder: "Anime", fixtureCase: "anime-planned",
    title: "葬送的芙莉蓮", originalTitle: "葬送のフリーレン", romajiTitle: "Sousou no Frieren",
    aliases: ["Frieren: Beyond Journey's End"], mediaType: "anime", format: "tv", status: "planned",
    progress: 0, total: 28, unit: "episode", year: 2023, genres: ["奇幻", "冒險"], people: ["MADHOUSE"],
    ...bangumiSource(400602, "https://lain.bgm.tv/pic/cover/l/13/c5/400602_ZI8Y9.jpg"),
  },
  {
    folder: "Anime", fixtureCase: "anime-watching",
    title: "孤獨搖滾！", originalTitle: "ぼっち・ざ・ろっく！", romajiTitle: "Bocchi the Rock!",
    mediaType: "anime", format: "tv", status: "watching", progress: 5, total: 12, unit: "episode",
    year: 2022, genres: ["音樂", "喜劇"], people: ["CloverWorks"], startedAt: "2026-07-01",
    ...bangumiSource(328609, "https://lain.bgm.tv/pic/cover/l/e2/e7/328609_2EHLJ.jpg"),
  },
  {
    folder: "Anime", fixtureCase: "anime-completed",
    title: "輝夜姬想讓人告白～天才們的戀愛頭腦戰～", originalTitle: "かぐや様は告らせたい～天才たちの恋愛頭脳戦～",
    romajiTitle: "Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen", mediaType: "anime", format: "tv",
    status: "completed", progress: 12, total: 12, unit: "episode", score: 8.5, year: 2019,
    genres: ["戀愛", "喜劇", "校園"], people: ["A-1 Pictures"], startedAt: "2026-06-01", completedAt: "2026-06-12",
    ...bangumiSource(248175, "https://lain.bgm.tv/pic/cover/l/2a/f7/248175_2w4zT.jpg"),
  },
  {
    folder: "Manga", fixtureCase: "manga-planned",
    title: "葬送的芙莉蓮", originalTitle: "葬送のフリーレン", romajiTitle: "Sousou no Frieren",
    mediaType: "manga", format: "manga", status: "planned", releaseStatus: "releasing", progress: 0, unit: "chapter",
    year: 2020, genres: ["奇幻", "冒險"], people: ["山田鐘人", "アベツカサ"],
    ...bangumiSource(305429, "https://lain.bgm.tv/pic/cover/l/a1/bd/305429_axzF3.jpg"),
  },
  {
    folder: "Manga", fixtureCase: "manga-reading",
    title: "碧藍之海", originalTitle: "ぐらんぶる", romajiTitle: "Grand Blue",
    mediaType: "manga", format: "manga", status: "reading", releaseStatus: "releasing", progress: 50, unit: "chapter",
    year: 2014, genres: ["喜劇", "校園"], people: ["井上堅二", "吉岡公威"], startedAt: "2026-07-03",
    ...bangumiSource(118165, "https://lain.bgm.tv/pic/cover/l/0f/2f/118165_f0m8c.jpg"),
  },
  {
    folder: "Manga", fixtureCase: "manga-on-hold",
    title: "入間同學入魔了", originalTitle: "魔入りました！入間くん", romajiTitle: "Mairimashita! Iruma-kun",
    mediaType: "manga", format: "manga", status: "on_hold", releaseStatus: "releasing", progress: 120, unit: "chapter",
    year: 2017, genres: ["奇幻", "喜劇", "校園"], people: ["西修"], startedAt: "2026-05-01",
    ...bangumiSource(210505, "https://lain.bgm.tv/pic/cover/l/41/4f/210505_1G4D9.jpg"),
  },
  {
    folder: "Manga", fixtureCase: "manga-dropped",
    title: "陰陽眼見子", originalTitle: "見える子ちゃん", romajiTitle: "Mieruko-chan",
    mediaType: "manga", format: "manga", status: "dropped", releaseStatus: "releasing", progress: 20, unit: "chapter",
    year: 2019, genres: ["恐怖", "喜劇"], people: ["泉朝樹"], startedAt: "2026-04-01",
    ...bangumiSource(267222, "https://lain.bgm.tv/pic/cover/l/42/d2/267222_u22Rt.jpg"),
  },
  {
    folder: "Manga", fixtureCase: "manga-completed",
    title: "輝夜姬想讓人告白～天才們的戀愛頭腦戰～", originalTitle: "かぐや様は告らせたい～天才たちの恋愛頭脳戦～",
    romajiTitle: "Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen", mediaType: "manga", format: "manga",
    status: "completed", releaseStatus: "finished", progress: "281.1", unit: "chapter", score: 9, year: 2016,
    genres: ["戀愛", "喜劇", "校園"], people: ["赤坂アカ"], startedAt: "2026-01-01", completedAt: "2026-05-30",
    ...bangumiSource(135218, "https://lain.bgm.tv/pic/cover/l/15/c9/135218_YYbSq.jpg"),
  },
  {
    folder: "Novel", fixtureCase: "novel-planned",
    title: "三坪房間的侵略者！？", originalTitle: "六畳間の侵略者!?", romajiTitle: "Rokujouma no Shinryakusha!?",
    mediaType: "novel", format: "light_novel", status: "planned", releaseStatus: "releasing", progress: 0, unit: "volume",
    year: 2009, genres: ["奇幻", "戀愛", "喜劇"], people: ["健速"],
    ...bangumiSource(4823, "https://lain.bgm.tv/pic/cover/l/0f/08/4823_vu3z9.jpg"),
  },
  {
    folder: "Novel", fixtureCase: "novel-add-volume",
    title: "不時以俄語遮羞的艾莉同學", originalTitle: "時々ボソッとロシア語でデレる隣のアーリャさん",
    romajiTitle: "Tokidoki Bosotto Russia-go de Dereru Tonari no Alya-san", mediaType: "novel", format: "light_novel",
    status: "reading", releaseStatus: "releasing", progress: 8, unit: "volume", year: 2021,
    genres: ["戀愛", "校園", "喜劇"], people: ["燦々SUN"], startedAt: "2026-06-01", volumeLog: completedVolumes(8),
    ...bangumiSource(339092, "https://lain.bgm.tv/pic/cover/l/96/b6/339092_zZK9L.jpg"),
  },
  {
    folder: "Novel", fixtureCase: "novel-on-hold",
    title: "不正經的魔術講師與禁忌教典", originalTitle: "ロクでなし魔術講師と禁忌教典",
    romajiTitle: "Rokudenashi Majutsu Koushi to Akashic Records", mediaType: "novel", format: "light_novel",
    status: "on_hold", releaseStatus: "finished", progress: 12, unit: "volume", year: 2014,
    genres: ["奇幻", "校園"], people: ["羊太郎"], startedAt: "2026-02-01", volumeLog: completedVolumes(12),
    ...bangumiSource(109635, "https://lain.bgm.tv/pic/cover/l/55/25/109635_8n2dM.jpg"),
  },
  {
    folder: "Novel", fixtureCase: "novel-dropped",
    title: "OVERLORD", originalTitle: "オーバーロード", romajiTitle: "Overlord",
    mediaType: "novel", format: "light_novel", status: "dropped", releaseStatus: "releasing", progress: 8, unit: "volume",
    year: 2012, genres: ["奇幻", "異世界"], people: ["丸山くがね"], startedAt: "2026-01-02", volumeLog: completedVolumes(8),
    ...bangumiSource(101929, "https://lain.bgm.tv/pic/cover/l/23/e9/101929_rFf6w.jpg"),
  },
  {
    folder: "Novel", fixtureCase: "novel-completed",
    title: "虎與龍", originalTitle: "とらドラ!", romajiTitle: "Toradora!",
    mediaType: "novel", format: "light_novel", status: "completed", releaseStatus: "finished", progress: 10, unit: "volume",
    score: 9, year: 2006, genres: ["戀愛", "校園", "喜劇"], people: ["竹宮ゆゆこ"],
    startedAt: "2026-01-01", completedAt: "2026-03-01", volumeLog: completedVolumes(10),
    ...bangumiSource(828, "https://lain.bgm.tv/pic/cover/l/c2/62/828_7MhE7.jpg"),
  },
  {
    folder: "Anime", fixtureCase: "legacy-favorite-completed",
    title: "命運石之門", originalTitle: "STEINS;GATE", romajiTitle: "Steins;Gate",
    mediaType: "anime", format: "tv", status: "completed", progress: 24, total: 24, unit: "episode", score: 9.5,
    favorite: true, year: 2011, genres: ["科幻", "懸疑"], people: ["WHITE FOX"], completedAt: "2026-07-01",
    preservationMarker: "legacy-favorite-completed",
    ...bangumiSource(10380, "https://lain.bgm.tv/pic/cover/l/a9/79/10380_YwP4R.jpg"),
  },
  {
    folder: "Anime", fixtureCase: "multi-label-ongoing",
    title: "ONE PIECE", originalTitle: "ONE PIECE", romajiTitle: "One Piece",
    mediaType: "anime", format: "tv", status: "ongoing", progress: 1100, total: 0, unit: "episode", favorite: true,
    masterpieceLabels: ["年度", "長篇"], year: 1999, genres: ["冒險", "奇幻"], people: ["東映アニメーション"],
    preservationMarker: "multi-label-ongoing",
    ...bangumiSource(975, "https://lain.bgm.tv/pic/cover/l/92/97/975_GFGYI.jpg"),
  },
  {
    folder: "Manga", fixtureCase: "shared-label-planned",
    title: "BLUE LOCK 藍色監獄", originalTitle: "ブルーロック", romajiTitle: "Blue Lock",
    mediaType: "manga", format: "manga", status: "planned", releaseStatus: "releasing", progress: 0, unit: "chapter",
    favorite: true, masterpieceLabels: ["年度"], year: 2018, genres: ["運動", "競技"], people: ["金城宗幸", "ノ村優介"],
    preservationMarker: "shared-label-planned",
    ...bangumiSource(266498, "https://lain.bgm.tv/pic/cover/l/f1/5b/266498_3188F.jpg"),
  },
  {
    folder: "Novel", fixtureCase: "retained-label-completed",
    title: "果然我的青春戀愛喜劇搞錯了。", originalTitle: "やはり俺の青春ラブコメはまちがっている。",
    romajiTitle: "Yahari Ore no Seishun Love Comedy wa Machigatteiru.", mediaType: "novel", format: "light_novel",
    status: "completed", releaseStatus: "finished", progress: 14, unit: "volume", favorite: false, masterpieceLabels: ["青春"],
    score: 8.5, year: 2011, genres: ["戀愛", "校園"], people: ["渡航"], completedAt: "2026-07-02",
    volumeLog: completedVolumes(14), preservationMarker: "retained-label-completed",
    ...bangumiSource(19441, "https://lain.bgm.tv/pic/cover/l/c2/73/19441_NOUhh.jpg"),
  },
  {
    folder: "Anime", fixtureCase: "control-planned",
    title: "86－不存在的戰區－", originalTitle: "86―エイティシックス―", romajiTitle: "86: Eighty-Six",
    mediaType: "anime", format: "tv", status: "planned", progress: 0, total: 11, unit: "episode", favorite: false,
    year: 2021, genres: ["科幻", "戰爭"], people: ["A-1 Pictures"], preservationMarker: "control-planned",
    ...bangumiSource(302189, "https://lain.bgm.tv/pic/cover/l/a4/b3/302189_1034v.jpg"),
  },
];

function fixtureRelativePath(item) {
  return path.join(TEST_LIBRARY_ROOT, item.folder, `${sanitizePathPart(item.title)}.md`);
}

function coverRelativePath(item) {
  return path.join(
    TEST_LIBRARY_ROOT,
    "Covers",
    item.mediaType,
    `${slugify(item.title)}-${item.sourceProvider}-${item.sourceId}.jpg`,
  );
}

function mediaNote(item) {
  const coverPath = coverRelativePath(item).split(path.sep).join("/");
  const lines = [
    "---",
    "schema_version: 5",
    `fixture_version: ${TEST_FIXTURE_VERSION}`,
    `fixture_case: ${yamlScalar(item.fixtureCase)}`,
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
  if (item.preservationMarker) lines.push(`fixture_preservation_marker: ${yamlScalar(item.preservationMarker)}`);
  lines.push(`year: ${yamlScalar(item.year)}`);
  lines.push(`cover: ${yamlScalar(coverPath)}`);
  lines.push(`cover_remote: ${yamlScalar(item.coverRemote)}`);
  yamlArray(lines, "genres", item.genres);
  yamlArray(lines, "title_aliases", item.aliases);
  if (item.mediaType === "anime") yamlArray(lines, "studios", item.people);
  else yamlArray(lines, "authors", item.people);
  lines.push(`source_provider: ${yamlScalar(item.sourceProvider)}`);
  lines.push(`source_id: ${yamlScalar(item.sourceId)}`);
  yamlArray(lines, "source_urls", item.sourceUrls);
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
    `![[${coverPath}|260]]`,
    "",
    item.preservationMarker
      ? `> PRESERVE BODY: ${item.preservationMarker}`
      : "> Shared Test Vault fixture based on a real collected work. User status/progress/dates are controlled test scenarios.",
  );
  return lines.join("\n");
}

function fixtureLooksCurrent(content, item) {
  const coverPath = coverRelativePath(item).split(path.sep).join("/");
  return content.includes(`fixture_version: ${TEST_FIXTURE_VERSION}`)
    && content.includes(`source_provider: ${yamlScalar(item.sourceProvider)}`)
    && content.includes(`source_id: ${yamlScalar(item.sourceId)}`)
    && content.includes(`cover: ${yamlScalar(coverPath)}`)
    && content.includes(`cover_remote: ${yamlScalar(item.coverRemote)}`);
}

async function downloadCover(vaultRoot, item, fetchImpl) {
  const relative = coverRelativePath(item);
  const target = path.join(vaultRoot, relative);
  const existing = fs.statSync(target, { throwIfNoEntry: false });
  if (existing?.isFile() && existing.size > 0) return { path: target, downloaded: false };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const response = await fetchImpl(item.coverRemote, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,*/*",
      "User-Agent": "AnimeList-Test-Vault/1.0",
    },
  });
  if (!response.ok) throw new Error(`Cover download failed (${response.status}) for ${item.title}`);
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (contentType && !/^image\//i.test(contentType)) {
    throw new Error(`Unexpected cover content type ${contentType} for ${item.title}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error(`Empty cover response for ${item.title}`);
  fs.writeFileSync(target, buffer);
  return { path: target, downloaded: true };
}

function checklistContent() {
  return `# AnimeList Test Checklist

> [!warning]
> This is a shared Test Vault that mirrors normal managed-library storage. The 18 works and their provider identities/covers are real; user status/progress/dates are controlled test scenarios. \`npm run test-vault\` preserves existing fixture edits. Run \`npm run test-vault:fixtures\` only when you intentionally want to reset the 18 baseline works.

## 1. Shared library sanity

The generated works live in the same managed folders used by normal collection:

- \`AnimeList/Anime\`
- \`AnimeList/Manga\`
- \`AnimeList/Novel\`
- local covers under \`AnimeList/Covers/<type>\`

\`\`\`animelist
source: AnimeList
\`\`\`

Check that all 18 real works show local covers, titles/original titles, genres, studios/authors, status, score, progress, and media-type filters normally. Opening the same vault again with \`npm run test-vault\` must not reset edits or create duplicate notes/covers.

## 2. Favorite / status controls

Expected shared counts before edits:

- Favorite: **3** titles (命運石之門, ONE PIECE, BLUE LOCK 藍色監獄).
- Completed: **5** titles.
- Wishlist / Planned: **5** titles.
- Ongoing: **1** title (ONE PIECE).

Click Completed → Favorite → Wishlist and confirm exactly one list button is active. Type, genre, search, sort, and view controls must keep working.

## 3. Favorite / Masterpiece compatibility

Keep **Special label mode = Favorite** first.

- 命運石之門 is a legacy \`favorite: true\` note with no \`masterpiece_labels\`; it must still appear in Favorite.
- Toggle the star on 86－不存在的戰區－ on, then off. Favorite count must change **3 → 4 → 3**.
- 果然我的青春戀愛喜劇搞錯了。 is not favorite even though its custom \`masterpiece_labels\` value exists.

Switch **Special label mode = Masterpiece**.

- ONE PIECE appears in **年度** and **長篇**; BLUE LOCK 藍色監獄 reuses **年度**.
- Click 86－不存在的戰區－'s star. The category modal must show existing categories and the new-category input on the same operation surface.
- Select two categories and save, then reopen and uncheck every category. The unique masterpiece count must return to 3.
- Switch Masterpiece → Favorite → Masterpiece. Existing category assignments must survive.

## 4. Edit / progress / preservation

- Confirm every \`fixture_preservation_marker\` and \`PRESERVE BODY\` line survives category/edit operations.
- Switch list view once and verify progress tracks use the available card width.
- Open [[AnimeList/Novel/不時以俄語遮羞的艾莉同學|不時以俄語遮羞的艾莉同學]], click **Edit**, add volume 9, and verify the row remains visible and uses the modal width.
- Run \`npm run test-vault\` again: that edit must still be present because ordinary Test Vault startup is non-destructive.
- Run \`npm run test-vault:fixtures\` only when you want to restore the baseline.

## 5. Release Tracking live-provider check

Enable **Fetch latest release information**, keep daily automatic checks off, then press **Check updates**.

These notes are collected as normal **Bangumi** works. Release Tracking must independently map manga to MangaDex and novels to NDL/JPRO; \`source_provider\` must not be MangaDex.

Manga expected to auto-match normally:

- 葬送的芙莉蓮 / 葬送のフリーレン
- 碧藍之海 / ぐらんぶる
- 入間同學入魔了 / 魔入りました！入間くん
- 陰陽眼見子 / 見える子ちゃん
- 輝夜姬想讓人告白 / かぐや様は告らせたい～天才たちの恋愛頭脳戦～

Novel expected to auto-resolve the main publication line normally:

- 三坪房間的侵略者！？ / 六畳間の侵略者!? / 健速
- 不時以俄語遮羞的艾莉同學 / 燦々SUN
- 不正經的魔術講師與禁忌教典 / 羊太郎
- OVERLORD / 丸山くがね

A genuinely ambiguous/unmatched work must still report uncertainty instead of guessing. Latest metadata must remain separate from reading progress.

## 6. Release Tracking result UI

After **Check updates**:

- Only the Release Tracking result/source-confirmation modal should use the new layout; Library/cards/toolbar/Detail layout must remain unchanged.
- Summary cards show updated / unchanged / needs review.
- Updated rows show before → after and source.
- Needs-review rows explain why nothing was overwritten.
- Unchanged items are collapsed by default.
- Footer states that release metadata is updated without changing reading progress.
`;
}

export async function prepareTestFixtures(vaultRoot, options = {}) {
  const resolvedVault = path.resolve(vaultRoot);
  const reset = options.reset === true;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("Test Vault cover preparation requires fetch().");

  const files = [];
  let created = 0;
  let reused = 0;
  let repaired = 0;
  let coversDownloaded = 0;

  for (const fixture of FIXTURES) {
    const relativePath = fixtureRelativePath(fixture);
    const target = path.join(resolvedVault, relativePath);
    const existed = fs.statSync(target, { throwIfNoEntry: false })?.isFile() ?? false;
    const existing = existed ? fs.readFileSync(target, "utf8") : "";

    const cover = await downloadCover(resolvedVault, fixture, fetchImpl);
    if (cover.downloaded) coversDownloaded += 1;

    if (!reset && existed && fixtureLooksCurrent(existing, fixture)) {
      files.push(target);
      reused += 1;
      continue;
    }

    writeFile(resolvedVault, relativePath, mediaNote(fixture));
    files.push(target);
    if (existed) repaired += 1;
    else created += 1;
  }

  const checklistPath = writeFile(resolvedVault, TEST_CHECKLIST_PATH, checklistContent());
  return {
    fixtureRoot: path.join(resolvedVault, TEST_LIBRARY_ROOT),
    checklistPath,
    files,
    created,
    reused,
    repaired,
    coversDownloaded,
  };
}

function defaultVaultRoot() {
  return path.resolve(process.env.ANIMELIST_TEST_VAULT || path.join(repoRoot, "test-vault"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const result = await prepareTestFixtures(defaultVaultRoot(), { reset: true });
  console.log(`AnimeList shared fixtures reset: ${result.fixtureRoot}`);
  console.log(`Checklist: ${result.checklistPath}`);
  console.log(`Fixtures: ${result.files.length}; created=${result.created}; repaired=${result.repaired}; covers downloaded=${result.coversDownloaded}`);
}
