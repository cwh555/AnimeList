import type { ExternalMediaResult } from "./types";

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return "";
}

function comparisonTitle(value: unknown): string {
  return stringValue(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

function normalizedFormat(value: unknown): string {
  const format = stringValue(value).trim().toLocaleLowerCase().replace(/[\s-]+/g, "_");
  if (format === "novel") return "light_novel";
  return format;
}

function titles(result: ExternalMediaResult): Set<string> {
  const output = new Set<string>();
  for (const value of [
    result.title,
    result.originalTitle,
    result.romajiTitle,
    ...(result.searchTitles ?? []),
  ]) {
    const normalized = comparisonTitle(value);
    if (normalized) output.add(normalized);
  }
  return output;
}

function yearsCompatible(left: ExternalMediaResult, right: ExternalMediaResult): boolean {
  const leftYear = Number(left.year);
  const rightYear = Number(right.year);
  if (!Number.isFinite(leftYear) || !Number.isFinite(rightYear) || leftYear <= 0 || rightYear <= 0) return true;
  return leftYear === rightYear;
}

function formatsCompatible(left: ExternalMediaResult, right: ExternalMediaResult): boolean {
  const leftFormat = normalizedFormat(left.format);
  const rightFormat = normalizedFormat(right.format);
  return !leftFormat || !rightFormat || leftFormat === rightFormat;
}

export function sameMediaWork(left: ExternalMediaResult, right: ExternalMediaResult): boolean {
  if (left.mediaType !== right.mediaType) return false;
  if (!yearsCompatible(left, right) || !formatsCompatible(left, right)) return false;
  const rightTitles = titles(right);
  return [...titles(left)].some((title) => rightTitles.has(title));
}

function containsHan(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}

function mergeSearchTitles(left: ExternalMediaResult, right: ExternalMediaResult): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of [
    ...(left.searchTitles ?? []),
    left.title,
    left.originalTitle,
    left.romajiTitle,
    ...(right.searchTitles ?? []),
    right.title,
    right.originalTitle,
    right.romajiTitle,
  ]) {
    const clean = stringValue(value).trim();
    const key = comparisonTitle(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

export function mergeAniListWithLocalizedResult(
  anilist: ExternalMediaResult,
  localized: ExternalMediaResult,
): ExternalMediaResult {
  const title = containsHan(localized.title) && !containsHan(anilist.title)
    ? localized.title
    : anilist.title;
  return {
    ...anilist,
    title,
    searchTitles: mergeSearchTitles(anilist, localized),
    coverUrl: anilist.coverUrl || localized.coverUrl,
    summary: anilist.summary || localized.summary,
  };
}

export function preferAniListSearchResults(results: readonly ExternalMediaResult[]): ExternalMediaResult[] {
  const consumed = new Set<number>();
  const output: ExternalMediaResult[] = [];
  for (let index = 0; index < results.length; index += 1) {
    if (consumed.has(index)) continue;
    const current = results[index];
    const matchingIndices: number[] = [];
    for (let candidateIndex = index; candidateIndex < results.length; candidateIndex += 1) {
      if (consumed.has(candidateIndex)) continue;
      const candidate = results[candidateIndex];
      const sameSource = current.provider === candidate.provider && current.sourceId === candidate.sourceId;
      if (sameSource || sameMediaWork(current, candidate)) matchingIndices.push(candidateIndex);
    }
    matchingIndices.forEach((candidateIndex) => consumed.add(candidateIndex));
    const matches = matchingIndices.map((candidateIndex) => results[candidateIndex]);
    const canonical = matches.find((result) => result.provider.toLocaleLowerCase() === "anilist") ?? current;
    const localized = matches.find((result) => (
      result !== canonical
      && result.provider.toLocaleLowerCase() === "bangumi"
      && containsHan(result.title)
    ));
    output.push(localized && canonical.provider.toLocaleLowerCase() === "anilist"
      ? mergeAniListWithLocalizedResult(canonical, localized)
      : { ...canonical });
  }
  return output;
}
