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
    bangumiId: typeof fm.bangumi_character_id === "string" ? fm.bangumi_character_id : String(fm.bangumi_character_id ?? ""),
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
    fence + "animelist-images",
    fence,
    "",
  ].join("\n");
}
