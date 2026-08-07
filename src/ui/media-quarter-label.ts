import { mediaSeasonQuarter, type MediaSeason } from "../domain/media-classification";
import type { MediaType } from "../domain/media-types";
import { uiText } from "../ui-text";

const SEASON_LABELS: Readonly<Record<MediaSeason, string>> = {
  winter: "冬季",
  spring: "春季",
  summer: "夏季",
  fall: "秋季",
};

function seasonValue(value: unknown): MediaSeason | null {
  return value === "winter" || value === "spring" || value === "summer" || value === "fall"
    ? value
    : null;
}

function yearValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const year = Number(value);
  return Number.isInteger(year) ? year : null;
}

export function mediaQuarterLabel(seasonInput: unknown, seasonYearInput: unknown): string {
  const season = seasonValue(seasonInput);
  const year = yearValue(seasonYearInput);
  if (!season) return "";
  const quarter = mediaSeasonQuarter(season);
  const period = [year === null ? "" : String(year), quarter].filter(Boolean).join(" ");
  const seasonLabel = season ? SEASON_LABELS[season] : "";
  return [period, seasonLabel ? `(${seasonLabel})` : ""].filter(Boolean).join(" ");
}

export function detailMediaQuarterLabel(
  mediaType: MediaType,
  season: unknown,
  seasonYear: unknown,
): string {
  if (mediaType !== "anime") return "";
  const quarter = mediaQuarterLabel(season, seasonYear);
  return quarter ? uiText("detail.quarter", { quarter }) : "";
}
