import { asArray, stringValue } from "./value-normalization";

export function normalizeUserTag(value: unknown): string {
  return stringValue(value)
    .normalize("NFKC")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
}

export function normalizeUserTags(values: unknown, limit = 32): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const raw of asArray(values)) {
    const value = normalizeUserTag(raw);
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}
