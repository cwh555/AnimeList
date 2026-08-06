import type { MediaSeason } from "./media-classification";
import type { MediaItem } from "./media-types";
import { normalizeStudioName, preferredStudioDisplayName, studioIdentityKey } from "./studio-identity";

export interface LibraryFilters {
  companies: string[];
  quarter: string;
  tags: string[];
}

export interface LibraryQuarterOption {
  key: string;
  season: MediaSeason;
  year: number;
}

export interface LibraryFilterOptions {
  companies: string[];
  quarters: LibraryQuarterOption[];
  tags: string[];
}

export const EMPTY_LIBRARY_FILTERS: Readonly<LibraryFilters> = Object.freeze({
  companies: [],
  quarter: "",
  tags: [],
});

const SEASON_ORDER: Readonly<Record<MediaSeason, number>> = {
  winter: 1,
  spring: 2,
  summer: 3,
  fall: 4,
};

function normalizeStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.normalize("NFKC").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mediaSeason(value: unknown): MediaSeason | null {
  return value === "winter" || value === "spring" || value === "summer" || value === "fall"
    ? value
    : null;
}

function mediaYear(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const year = Number(value);
  return Number.isInteger(year) ? year : null;
}

export function libraryQuarterKey(seasonInput: unknown, yearInput: unknown): string {
  const season = mediaSeason(seasonInput);
  const year = mediaYear(yearInput);
  return season && year !== null ? `${year}:${season}` : "";
}

export function normalizeLibraryFilters(value: unknown, legacyGenre: unknown = "all"): LibraryFilters {
  const input = record(value);
  const legacyTag = typeof legacyGenre === "string" && legacyGenre !== "all"
    ? legacyGenre.normalize("NFKC").trim()
    : "";
  const tags = normalizeStrings(input.tags);
  if (!tags.length && legacyTag) tags.push(legacyTag);
  return {
    companies: normalizeStrings(input.companies),
    quarter: typeof input.quarter === "string" ? input.quarter.trim() : "",
    tags,
  };
}

export function libraryFilterCount(filters: LibraryFilters): number {
  return filters.companies.length + filters.tags.length + (filters.quarter ? 1 : 0);
}

export function reconcileLibraryFilters(
  filters: LibraryFilters,
  options: LibraryFilterOptions,
): LibraryFilters {
  const companies = new Map(options.companies.map((company) => [studioIdentityKey(company), company]));
  const tags = new Set(options.tags);
  const quarters = new Set(options.quarters.map((option) => option.key));
  const selectedCompanies: string[] = [];
  const selectedCompanyKeys = new Set<string>();
  for (const company of filters.companies) {
    const key = studioIdentityKey(company);
    const canonical = companies.get(key);
    if (!key || !canonical || selectedCompanyKeys.has(key)) continue;
    selectedCompanyKeys.add(key);
    selectedCompanies.push(canonical);
  }
  return {
    companies: selectedCompanies,
    quarter: quarters.has(filters.quarter) ? filters.quarter : "",
    tags: filters.tags.filter((tag) => tags.has(tag)),
  };
}


export function toggleLibraryFilterValue(values: readonly string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

export function toggleLibraryQuarter(current: string, value: string): string {
  return current === value ? "" : value;
}

export function libraryItemMatchesFilters(item: MediaItem, filters: LibraryFilters): boolean {
  if (filters.companies.length) {
    if (item.mediaType !== "anime") return false;
    const companyKeys = new Set(item.people.map(studioIdentityKey).filter(Boolean));
    if (!filters.companies.every((company) => companyKeys.has(studioIdentityKey(company)))) return false;
  }
  if (filters.quarter) {
    if (item.mediaType !== "anime") return false;
    if (libraryQuarterKey(item.season, item.seasonYear) !== filters.quarter) return false;
  }
  return filters.tags.every((tag) => item.genres.includes(tag));
}

export function collectLibraryFilterOptions(items: readonly MediaItem[]): LibraryFilterOptions {
  const companies = new Map<string, string>();
  const tags = new Set<string>();
  const quarters = new Map<string, LibraryQuarterOption>();

  for (const item of items) {
    for (const tag of item.genres) {
      const normalized = tag.normalize("NFKC").trim();
      if (normalized) tags.add(normalized);
    }
    if (item.mediaType !== "anime") continue;
    for (const company of item.people) {
      const normalized = normalizeStudioName(company);
      const key = studioIdentityKey(normalized);
      if (!key) continue;
      const current = companies.get(key);
      companies.set(key, current ? preferredStudioDisplayName(current, normalized) : normalized);
    }
    const season = mediaSeason(item.season);
    const year = mediaYear(item.seasonYear);
    if (!season || year === null) continue;
    const key = libraryQuarterKey(season, year);
    quarters.set(key, { key, season, year });
  }

  return {
    companies: [...companies.values()].sort((left, right) => left.localeCompare(right, "zh-Hant")),
    quarters: [...quarters.values()].sort((left, right) => (
      right.year - left.year || SEASON_ORDER[right.season] - SEASON_ORDER[left.season]
    )),
    tags: [...tags].sort((left, right) => left.localeCompare(right, "zh-Hant")),
  };
}
