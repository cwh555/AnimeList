/** A character is a user-selected identity, not an automatic media-list entry. */
export type CharacterTier = "top" | "high" | "liked";

export interface CharacterCandidate {
  name: string;
  bangumiId?: string;
  portrait?: string;
  appearance?: string;
  relation?: string;
}

export interface CharacterRecord {
  id: string;
  path: string;
  name: string;
  tier: CharacterTier;
  bangumiId: string;
  portrait: string;
  appearances: string[];
}

export function characterTier(value: unknown): CharacterTier {
  return value === "top" || value === "high" ? value : "liked";
}

export function characterAppearances(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string =>
    typeof entry === "string" && entry.trim().length > 0).map(entry => entry.trim()))];
}

/** Never treat matching names as proof that two characters are the same. */
export function findExistingCharacter(
  characters: readonly CharacterRecord[],
  candidate: CharacterCandidate,
): CharacterRecord | undefined {
  return candidate.bangumiId
    ? characters.find(item => item.bangumiId !== "" && item.bangumiId === candidate.bangumiId)
    : undefined;
}

export function characterFromFrontmatter(value: unknown, path: string): CharacterRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fm = value as Record<string, unknown>;
  if (fm.animelist_character !== true
    || typeof fm.character_id !== "string" || !fm.character_id
    || typeof fm.character_name !== "string" || !fm.character_name.trim()) return null;
  return {
    id: fm.character_id,
    path,
    name: fm.character_name.trim(),
    tier: characterTier(fm.character_tier),
    bangumiId: typeof fm.bangumi_character_id === "string" ? fm.bangumi_character_id : typeof fm.bangumi_character_id === "number" && Number.isSafeInteger(fm.bangumi_character_id) ? String(fm.bangumi_character_id) : "",
    portrait: typeof fm.character_portrait === "string" ? fm.character_portrait : "",
    appearances: characterAppearances(fm.character_appearances),
  };
}

export function mergeCharacterAppearances(
  existing: readonly string[], appearance: string | undefined,
): string[] {
  return characterAppearances([...existing, ...(appearance ? [appearance] : [])]);
}

export function characterNoteSource(
  id: string,
  candidate: CharacterCandidate,
): string {
  const name = candidate.name.trim();
  if (!name) throw new Error("Character name is required");
  const scalar = (value: string): string => JSON.stringify(value);
  const appearances = mergeCharacterAppearances([], candidate.appearance);
  const fence = String.fromCharCode(96).repeat(3);
  return [
    "---",
    "animelist_character: true",
    "character_id: " + scalar(id),
    "character_name: " + scalar(name),
    "character_tier: liked",
    "bangumi_character_id: " + scalar(candidate.bangumiId ?? ""),
    "character_portrait: " + scalar(candidate.portrait ?? ""),
    "character_appearances:",
    ...appearances.map(path => "  - " + scalar(path)),
    "---",
    "# " + name.replace(/[\r\n]/g, " "),
    "",
    fence + "animelist-character",
    fence,
    "",
    ...(appearances.length ? [characterWorksBlock(appearances), ""] : []),
    fence + "animelist-images",
    fence,
    "",
  ].join("\n");
}

/** Presentation reflects both character identity and per-work appearance membership. */
export function characterCollectionAction(
  records: readonly CharacterRecord[], candidate: CharacterCandidate,
): "collect" | "link" | "collected" {
  const existing = findExistingCharacter(records, candidate);
  if (!existing) return "collect";
  if (candidate.appearance && !existing.appearances.includes(candidate.appearance)) return "link";
  return "collected";
}

const WORK_LINKS_START = "<!-- animelist:character-works:start -->";
const WORK_LINKS_END = "<!-- animelist:character-works:end -->";

export function characterWorksBlock(appearances: readonly string[]): string {
  const links = characterAppearances(appearances)
    .map(path => "- [[" + path.replace(/[\r\n\]|]/g, "") + "]]");
  return [WORK_LINKS_START, "## 登場作品", ...links, WORK_LINKS_END].join("\n");
}

/** Keep unrelated frontmatter, Markdown prose and existing image sessions intact. */
export function syncCharacterWorks(markdown: string, appearances: readonly string[]): string {
  const links = characterAppearances(appearances);
  const begin = markdown.indexOf(WORK_LINKS_START);
  const end = markdown.indexOf(WORK_LINKS_END);
  if (begin >= 0 && end >= begin) {
    const close = end + WORK_LINKS_END.length;
    if (!links.length) return markdown.slice(0, begin) + markdown.slice(close).replace(/^\r?\n/, "");
    return markdown.slice(0, begin) + characterWorksBlock(links) + markdown.slice(close);
  }
  if (!links.length) return markdown;
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const block = characterWorksBlock(links).replace(/\n/g, newline);
  const beforeImages = markdown.indexOf(String.fromCharCode(96).repeat(3) + "animelist-images");
  if (beforeImages >= 0) return markdown.slice(0, beforeImages) + block + newline + newline + markdown.slice(beforeImages);
  return markdown + (markdown.endsWith(newline) ? newline : newline + newline) + block + newline;
}

/** Non-destructively upgrade character notes created before the native info card existed. */
export function ensureCharacterCardBlock(markdown: string): string {
  const marker = String.fromCharCode(96).repeat(3) + "animelist-character";
  if (markdown.includes(marker)) return markdown;
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const start = lines[0] === "---" ? lines.indexOf("---", 1) + 1 : 0;
  const titleLine = lines.findIndex((line, index) => index >= start && /^#\s+/.test(line));
  const at = titleLine >= 0 ? titleLine + 1 : start;
  lines.splice(at, 0, "", marker, String.fromCharCode(96).repeat(3), "");
  return lines.join(newline);
}
