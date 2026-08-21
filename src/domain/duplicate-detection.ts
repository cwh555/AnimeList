import type { ExternalMediaResult, MediaType } from "../types";

export interface StoredMediaIdentity {
  filePath: string;
  title: string;
  originalTitle: string;
  romajiTitle: string;
  aliases: string[];
  mediaType: MediaType;
  format: string;
  year: number | string;
  total: number;
  provider: string;
  sourceId: string;
  sourceUrls: string[];
}

export interface DuplicateMediaMatch {
  filePath: string;
  title: string;
  reason: "source" | "canonical-titles";
}

const CHINESE_NUMBER_DIGITS = new Map<string, number>([
  ["〇", 0], ["零", 0], ["一", 1], ["二", 2], ["兩", 2], ["两", 2], ["三", 3],
  ["四", 4], ["五", 5], ["六", 6], ["七", 7], ["八", 8], ["九", 9],
]);

function normalizeTitle(value: string): string {
  return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function normalizeSourceUrl(value: string): string {
  return String(value || "").trim().replace(/\/+$/u, "");
}

function positiveNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function chineseNumberValue(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  if (text === "十") return 10;
  const tenIndex = text.indexOf("十");
  if (tenIndex >= 0) {
    const tens = tenIndex === 0 ? 1 : CHINESE_NUMBER_DIGITS.get(text[tenIndex - 1]);
    const ones = tenIndex === text.length - 1 ? 0 : CHINESE_NUMBER_DIGITS.get(text[tenIndex + 1]);
    return tens == null || ones == null ? null : tens * 10 + ones;
  }
  if ([...text].every((character) => CHINESE_NUMBER_DIGITS.has(character))) {
    return Number([...text].map((character) => CHINESE_NUMBER_DIGITS.get(character)).join(""));
  }
  return null;
}

interface InstallmentProfile {
  seasons: Set<number>;
  parts: Set<number>;
  editions: Set<string>;
}

function installmentProfile(titles: string[]): InstallmentProfile {
  const profile: InstallmentProfile = {
    seasons: new Set<number>(),
    parts: new Set<number>(),
    editions: new Set<string>(),
  };
  for (const title of titles) {
    const text = String(title || "").normalize("NFKC").toLocaleLowerCase();
    const chineseSeason = text.match(/第\s*([0-9〇零一二兩两三四五六七八九十]+)\s*(?:季|期)/u);
    const englishSeason = text.match(/\b(?:season|series|s)\s*([0-9]+)\b/u)
      ?? text.match(/\b([0-9]+)(?:st|nd|rd|th)\s+season\b/u);
    const chinesePart = text.match(/第\s*([0-9〇零一二兩两三四五六七八九十]+)\s*部/u);
    const englishPart = text.match(/\b(?:part|cour)\s*([0-9]+)\b/u);
    const season = chineseSeason ? chineseNumberValue(chineseSeason[1]) : englishSeason ? Number(englishSeason[1]) : null;
    const part = chinesePart ? chineseNumberValue(chinesePart[1]) : englishPart ? Number(englishPart[1]) : null;
    if (season != null) profile.seasons.add(season);
    if (part != null) profile.parts.add(part);
    if (/劇場版|剧场版|movie|theatrical/u.test(text)) profile.editions.add("movie");
    if (/\bova\b/u.test(text)) profile.editions.add("ova");
    if (/\bona\b/u.test(text)) profile.editions.add("ona");
    if (/特別篇|特别篇|special|\bsp\b/u.test(text)) profile.editions.add("special");
    if (/外傳|外传|外伝|spin[ -]?off|side story/u.test(text)) profile.editions.add("spinoff");
    if (/總集篇|总集篇|総集編|recap/u.test(text)) profile.editions.add("recap");
  }
  return profile;
}

function setValuesMatch<T>(left: Set<T>, right: Set<T>): boolean {
  if (left.size === 0 && right.size === 0) return true;
  if (left.size === 0 || right.size === 0) return false;
  return [...left].some((value) => right.has(value));
}

function installmentProfilesMatch(leftTitles: string[], rightTitles: string[]): boolean {
  const left = installmentProfile(leftTitles);
  const right = installmentProfile(rightTitles);
  return setValuesMatch(left.seasons, right.seasons)
    && setValuesMatch(left.parts, right.parts)
    && setValuesMatch(left.editions, right.editions);
}

function normalizedFormat(value: string): string {
  const format = String(value || "").trim().toLocaleLowerCase();
  return format === "tv_short" ? "tv" : format;
}

function titleSet(values: string[]): Set<string> {
  return new Set(values.map(normalizeTitle).filter(Boolean));
}

function sourceMatches(result: ExternalMediaResult, stored: StoredMediaIdentity): boolean {
  if (result.provider && result.sourceId
      && result.provider === stored.provider && String(result.sourceId) === String(stored.sourceId)) {
    return true;
  }
  const resultUrl = normalizeSourceUrl(result.sourceUrl);
  return Boolean(resultUrl) && stored.sourceUrls.some((url) => normalizeSourceUrl(url) === resultUrl);
}

function canonicalTitlesMatch(result: ExternalMediaResult, stored: StoredMediaIdentity): boolean {
  if (result.mediaType !== "anime" || stored.mediaType !== "anime") return false;
  const resultYear = positiveNumber(result.year);
  const storedYear = positiveNumber(stored.year);
  if (!resultYear || !storedYear || resultYear !== storedYear) return false;
  if (!result.format || !stored.format || normalizedFormat(result.format) !== normalizedFormat(stored.format)) return false;
  const resultTotal = positiveNumber(result.total);
  const storedTotal = positiveNumber(stored.total);
  if (resultTotal && storedTotal && resultTotal !== storedTotal) return false;

  const resultTitles = [result.title, result.originalTitle, result.romajiTitle, ...(result.searchTitles ?? [])]
    .map((title) => String(title || "").trim())
    .filter(Boolean);
  const storedTitles = [stored.title, stored.originalTitle, stored.romajiTitle, ...stored.aliases]
    .map((title) => String(title || "").trim())
    .filter(Boolean);
  if (!installmentProfilesMatch(resultTitles, storedTitles)) return false;

  const resultOriginal = normalizeTitle(result.originalTitle);
  const storedOriginal = normalizeTitle(stored.originalTitle);
  if (!resultOriginal || !storedOriginal || resultOriginal !== storedOriginal) return false;
  const storedKeys = titleSet(storedTitles);
  const exactMatches = [...titleSet(resultTitles)].filter((title) => storedKeys.has(title));
  return exactMatches.length >= 2;
}

export function findConfidentDuplicate(
  result: ExternalMediaResult,
  storedItems: StoredMediaIdentity[],
): DuplicateMediaMatch | null {
  for (const stored of storedItems) {
    if (result.mediaType !== stored.mediaType) continue;
    if (sourceMatches(result, stored)) {
      return { filePath: stored.filePath, title: stored.title, reason: "source" };
    }
  }
  for (const stored of storedItems) {
    if (canonicalTitlesMatch(result, stored)) {
      return { filePath: stored.filePath, title: stored.title, reason: "canonical-titles" };
    }
  }
  return null;
}
