import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { prepareTestFixtures } from "./test-vault-fixtures.mjs";

export const RELEASE_TRACKING_MANGA_ANILIST_IDS = new Map([
  ["305429", "118586"], // 葬送的芙莉蓮
  ["118165", "87395"], // 碧藍之海 / Grand Blue
  ["210505", "99324"], // 入間同學入魔了
  ["267222", "105097"], // 陰陽眼見子 / Mieruko-chan
  ["135218", "86635"], // 輝夜姬想讓人告白
]);

const CHECKLIST_MARKER = "### Official-source coverage expectations";
const CHECKLIST_APPENDIX = `

${CHECKLIST_MARKER}

The five manga fixtures above keep Bangumi as their primary \`source_provider\`, and also preserve a verified \`anilist_id\` so the exact-work official external-link path is exercised during manual release checks.

- **碧藍之海 / ぐらんぶる** — expect **Ch.111** from Comic DAYS rather than stale MangaDex Ch.108.
- **葬送的芙莉蓮** — expect **Ch.147** from VIZ when available rather than stale MangaDex coverage.
- **陰陽眼見子 / 見える子ちゃん** — expect **Ch.72** from Kadocomi when available.
- **輝夜姬想讓人告白** — provider main latest should be **Ch.281** while reading progress **Ch.281.1** stays unchanged and must not become \`source_regressed\`.
- **入間同學入魔了** — combine Champion Cross and MangaDex evidence; if the official page is behind, keep the newer valid MangaDex main chapter instead of regressing.
`;

function frontmatterLines(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  return {
    match,
    lines: match[1].split(/\r?\n/),
  };
}

function scalar(lines, key) {
  const prefix = `${key}:`;
  const line = lines.find((entry) => entry.startsWith(prefix));
  if (!line) return "";
  const raw = line.slice(prefix.length).trim();
  if (!raw) return "";
  try {
    const value = JSON.parse(raw);
    return value == null ? "" : String(value);
  } catch {
    return raw.replace(/^['"]|['"]$/g, "");
  }
}

function withAniListId(content, anilistId) {
  const frontmatter = frontmatterLines(content);
  if (!frontmatter) return content;
  const { match, lines } = frontmatter;
  const expected = `anilist_id: ${JSON.stringify(anilistId)}`;
  const existingIndex = lines.findIndex((line) => line.startsWith("anilist_id:"));
  if (existingIndex >= 0) {
    if (lines[existingIndex] === expected) return content;
    lines[existingIndex] = expected;
  } else {
    const anchorIndex = Math.max(
      lines.findIndex((line) => line.startsWith("title_romaji:")),
      lines.findIndex((line) => line.startsWith("title_original:")),
      lines.findIndex((line) => line.startsWith("title:")),
    );
    lines.splice(anchorIndex >= 0 ? anchorIndex + 1 : 0, 0, expected);
  }
  const replacement = `---\n${lines.join("\n")}\n---\n`;
  return replacement + content.slice(match[0].length);
}

function fixtureAniListId(content) {
  const frontmatter = frontmatterLines(content);
  if (!frontmatter) return "";
  const { lines } = frontmatter;
  if (!scalar(lines, "fixture_case")) return "";
  if (scalar(lines, "media_type") !== "manga") return "";
  if (scalar(lines, "source_provider") !== "bangumi") return "";
  return RELEASE_TRACKING_MANGA_ANILIST_IDS.get(scalar(lines, "source_id")) ?? "";
}

export function applyReleaseTrackingTestFixtureMetadata(fixtures) {
  let updated = 0;
  let verified = 0;
  for (const file of fixtures.files ?? []) {
    if (!String(file).toLowerCase().endsWith(".md")) continue;
    const content = fs.readFileSync(file, "utf8");
    const anilistId = fixtureAniListId(content);
    if (!anilistId) continue;
    verified += 1;
    const next = withAniListId(content, anilistId);
    if (next === content) continue;
    fs.writeFileSync(file, next);
    updated += 1;
  }

  const checklistPath = fixtures.checklistPath;
  if (checklistPath && fs.statSync(checklistPath, { throwIfNoEntry: false })?.isFile()) {
    const checklist = fs.readFileSync(checklistPath, "utf8");
    if (!checklist.includes(CHECKLIST_MARKER)) {
      fs.writeFileSync(checklistPath, `${checklist.trimEnd()}${CHECKLIST_APPENDIX}\n`);
    }
  }

  return { updated, verified };
}

function defaultVaultRoot() {
  const scriptPath = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(scriptPath), "..");
  return path.resolve(process.env.ANIMELIST_TEST_VAULT || path.join(repoRoot, "test-vault"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--reset")) {
    console.error("Usage: node scripts/release-tracking-test-fixtures.mjs --reset");
    process.exit(1);
  }
  const fixtures = await prepareTestFixtures(defaultVaultRoot(), { reset: true });
  const releaseTracking = applyReleaseTrackingTestFixtureMetadata(fixtures);
  console.log(`AnimeList shared fixtures reset: ${fixtures.fixtureRoot}`);
  console.log(`Checklist: ${fixtures.checklistPath}`);
  console.log(`Fixtures: ${fixtures.files.length}; release identities verified=${releaseTracking.verified}; updated=${releaseTracking.updated}`);
}
