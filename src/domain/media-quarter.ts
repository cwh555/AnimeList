import { normalizeMediaSeason, type MediaSeason } from "./media-classification";

export type EditableMediaQuarter =
  | { kind: "empty" }
  | { kind: "valid"; season: MediaSeason; seasonYear: number }
  | { kind: "invalid" };

function quarterSeason(value: unknown): MediaSeason | null {
  const text = typeof value === "string" || typeof value === "number"
    ? String(value).normalize("NFKC").trim().toLocaleLowerCase()
    : "";
  if (text === "q1") return "winter";
  if (text === "q2") return "spring";
  if (text === "q3") return "summer";
  if (text === "q4") return "fall";
  return normalizeMediaSeason(text);
}

function quarterYearText(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).normalize("NFKC").trim();
}

/**
 * Parse a manually edited anime calendar quarter. The UI exposes a controlled
 * Q1-Q4 selector and a four-digit year field, but persistence validates the
 * same contract so malformed programmatic form values cannot reach YAML.
 */
export function parseEditableMediaQuarter(
  seasonValue: unknown,
  seasonYearValue: unknown,
): EditableMediaQuarter {
  const seasonText = typeof seasonValue === "string" || typeof seasonValue === "number"
    ? String(seasonValue).normalize("NFKC").trim()
    : "";
  const yearText = quarterYearText(seasonYearValue);
  if (!seasonText && !yearText) return { kind: "empty" };

  const season = quarterSeason(seasonText);
  if (!season || !/^[1-9]\d{3}$/.test(yearText)) return { kind: "invalid" };
  return { kind: "valid", season, seasonYear: Number(yearText) };
}

export function editableMediaQuarterText(
  seasonValue: unknown,
  seasonYearValue: unknown,
): string {
  const quarter = parseEditableMediaQuarter(seasonValue, seasonYearValue);
  if (quarter.kind !== "valid") return "";
  const number = quarter.season === "winter" ? 1
    : quarter.season === "spring" ? 2
      : quarter.season === "summer" ? 3
        : 4;
  return `${quarter.seasonYear} Q${number}`;
}

export function parseEditableMediaQuarterText(value: unknown): EditableMediaQuarter {
  const text = typeof value === "string" || typeof value === "number"
    ? String(value).normalize("NFKC").trim()
    : "";
  if (!text) return { kind: "empty" };
  const match = /^([1-9]\d{3})\s+Q([1-4])$/i.exec(text);
  if (!match) return { kind: "invalid" };
  return parseEditableMediaQuarter(`Q${match[2]}`, match[1]);
}
