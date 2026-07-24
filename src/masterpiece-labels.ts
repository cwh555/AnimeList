export const DEFAULT_MASTERPIECE_LABEL = "masterpiece";

export type SpecialLabelMode = "favorite" | "masterpiece";

export interface SpecialLabelState {
  favorite: boolean;
  masterpieceLabels: string[];
}

export function normalizeSpecialLabelMode(value: unknown): SpecialLabelMode {
  return value === "masterpiece" ? "masterpiece" : "favorite";
}

export function normalizeMasterpieceLabel(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function normalizeMasterpieceLabels(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const output: string[] = [];
  const seen = new Set<string>();
  for (const entry of values) {
    const label = normalizeMasterpieceLabel(entry);
    if (!label) continue;
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(label);
  }
  return output;
}

export function labelsForMasterpieceEnable(value: unknown): string[] {
  const labels = normalizeMasterpieceLabels(value);
  return labels.length ? labels : [DEFAULT_MASTERPIECE_LABEL];
}

export function stateAfterFavoriteChange(
  currentLabels: unknown,
  nextFavorite: boolean,
): SpecialLabelState {
  const labels = normalizeMasterpieceLabels(currentLabels);
  if (nextFavorite) return { favorite: true, masterpieceLabels: labels };
  const customLabels = labels.filter((label) => (
    label.toLocaleLowerCase() !== DEFAULT_MASTERPIECE_LABEL
  ));
  return { favorite: false, masterpieceLabels: customLabels };
}

export function stateAfterMasterpieceSelection(selectedLabels: unknown): SpecialLabelState {
  const labels = normalizeMasterpieceLabels(selectedLabels);
  return { favorite: labels.length > 0, masterpieceLabels: labels };
}

export function collectMasterpieceLabels(items: Array<{
  favorite?: boolean;
  masterpieceLabels?: unknown;
}>): string[] {
  const labels = items.flatMap((item) => {
    const normalized = normalizeMasterpieceLabels(item.masterpieceLabels);
    return item.favorite && normalized.length === 0
      ? [DEFAULT_MASTERPIECE_LABEL]
      : normalized;
  });
  return normalizeMasterpieceLabels(labels).sort((left, right) => left.localeCompare(right, "en"));
}

export function renameMasterpieceLabel(
  labels: unknown,
  previousLabel: string,
  nextLabel: string,
): string[] {
  const previous = normalizeMasterpieceLabel(previousLabel).toLocaleLowerCase();
  const replacement = normalizeMasterpieceLabel(nextLabel);
  if (!previous || !replacement) return normalizeMasterpieceLabels(labels);
  return normalizeMasterpieceLabels(
    normalizeMasterpieceLabels(labels).map((label) => (
      label.toLocaleLowerCase() === previous ? replacement : label
    )),
  );
}

export function deleteMasterpieceLabel(labels: unknown, targetLabel: string): string[] {
  const target = normalizeMasterpieceLabel(targetLabel).toLocaleLowerCase();
  return normalizeMasterpieceLabels(labels).filter((label) => label.toLocaleLowerCase() !== target);
}
