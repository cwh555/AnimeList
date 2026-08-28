export const UNKNOWN_COMPLETION_DATE = "unknown";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isUnknownCompletionDate(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLocaleLowerCase() === UNKNOWN_COMPLETION_DATE;
}

export function completionDateTimestamp(value: unknown): number | null {
  if (isUnknownCompletionDate(value)) return null;
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  const match = ISO_DATE_PATTERN.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.getTime();
}

export function normalizeCompletionDate(value: unknown): string {
  if (isUnknownCompletionDate(value)) return UNKNOWN_COMPLETION_DATE;
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return completionDateTimestamp(text) === null ? "" : text;
}
