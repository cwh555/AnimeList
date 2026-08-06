import { asArray, stringValue } from "./value-normalization";

const STUDIO_LIST_SEPARATOR_PATTERN = /[、,，;；\n/×]+/u;
const LABELED_VALUE_PATTERN = /^.{1,24}[:：]\s*\S/u;
const BRACKET_CHARACTERS = new Set("()[]{}（）［］【】〈〉《》");
const MAX_STUDIO_NAME_LENGTH = 96;

function studioText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && !Array.isArray(value) && "name" in value) {
    return stringValue((value as { name?: unknown }).name);
  }
  return "";
}

export function normalizeStudioName(value: unknown): string {
  return studioText(value)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/u, "")
    .trim();
}

/**
 * Stable comparison key for display-format variants of the same provider name.
 * It intentionally ignores spacing and punctuation only; it does not contain a
 * company alias table and does not guess corporate relationships.
 */
export function studioIdentityKey(value: unknown): string {
  return normalizeStudioName(value)
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

/**
 * Reject values that are structurally metadata/alias blobs instead of one
 * provider-supplied company name. Role selection itself remains provider-owned.
 */
export function isSingleStudioDisplayValue(value: unknown): boolean {
  const raw = studioText(value).normalize("NFKC").trim();
  const normalized = normalizeStudioName(raw);
  if (!normalized || normalized.length > MAX_STUDIO_NAME_LENGTH) return false;
  if (LABELED_VALUE_PATTERN.test(normalized)) return false;
  if ([...normalized].some((character) => BRACKET_CHARACTERS.has(character))) return false;
  return true;
}

function displayScore(value: string): number {
  const separators = [...value].filter((character) => /[\s\p{P}\p{S}]/u.test(character)).length;
  return separators * 100 + value.length;
}

export function preferredStudioDisplayName(left: string, right: string): string {
  const leftName = normalizeStudioName(left);
  const rightName = normalizeStudioName(right);
  if (!leftName) return rightName;
  if (!rightName) return leftName;
  if (studioIdentityKey(leftName) !== studioIdentityKey(rightName)) return leftName;
  return displayScore(rightName) > displayScore(leftName) ? rightName : leftName;
}

export function normalizeStudioNames(values: unknown, limit = 1): string[] {
  const order: string[] = [];
  const byIdentity = new Map<string, string>();

  for (const raw of asArray(values)) {
    const text = studioText(raw);
    for (const rawPart of text.split(STUDIO_LIST_SEPARATOR_PATTERN)) {
      const studio = normalizeStudioName(rawPart);
      if (!isSingleStudioDisplayValue(studio)) continue;
      const key = studioIdentityKey(studio);
      if (!key) continue;
      const current = byIdentity.get(key);
      if (current === undefined) {
        order.push(key);
        byIdentity.set(key, studio);
      } else {
        byIdentity.set(key, preferredStudioDisplayName(current, studio));
      }
    }
  }

  return order
    .map((key) => byIdentity.get(key) ?? "")
    .filter(Boolean)
    .slice(0, Math.max(0, limit));
}
