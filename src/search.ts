import type { ExternalMediaResult } from "./types";

const CHINESE_NUMBER_DIGITS = new Map<string, number>([
  ["〇", 0], ["零", 0], ["一", 1], ["二", 2], ["兩", 2], ["两", 2], ["三", 3], ["四", 4],
  ["五", 5], ["六", 6], ["七", 7], ["八", 8], ["九", 9],
]);

export function normalizeSearchComparable(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
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

function extractSeasonNumber(value: string): number | null {
  const text = value.normalize("NFKC").toLocaleLowerCase();
  const chinese = text.match(/第\s*([0-9〇零一二兩两三四五六七八九十]+)\s*(?:季|期)/u);
  if (chinese) return chineseNumberValue(chinese[1]);
  const english = text.match(/\b(?:season|series|s)\s*([0-9]+)\b/u)
    ?? text.match(/\b([0-9]+)(?:st|nd|rd|th)\s+season\b/u);
  return english ? Number(english[1]) : null;
}

function extractPartNumber(value: string): number | null {
  const text = value.normalize("NFKC").toLocaleLowerCase();
  const chinese = text.match(/第\s*([0-9〇零一二兩两三四五六七八九十]+)\s*部/u);
  if (chinese) return chineseNumberValue(chinese[1]);
  const english = text.match(/\b(?:part|cour)\s*([0-9]+)\b/u);
  return english ? Number(english[1]) : null;
}

function editionMarkers(value: string): Set<string> {
  const text = value.normalize("NFKC").toLocaleLowerCase();
  const output = new Set<string>();
  if (/劇場版|剧场版|movie|theatrical/u.test(text)) output.add("movie");
  if (/\bova\b/u.test(text)) output.add("ova");
  if (/\bona\b/u.test(text)) output.add("ona");
  if (/特別篇|特别篇|special|\bsp\b/u.test(text)) output.add("special");
  if (/外傳|外传|外伝|spin[ -]?off|side story/u.test(text)) output.add("spinoff");
  if (/總集篇|总集篇|総集編|recap/u.test(text)) output.add("recap");
  return output;
}

function diceCoefficient(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;
  const leftPairs = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2);
    leftPairs.set(pair, (leftPairs.get(pair) ?? 0) + 1);
  }
  let intersection = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2);
    const count = leftPairs.get(pair) ?? 0;
    if (!count) continue;
    intersection += 1;
    if (count === 1) leftPairs.delete(pair);
    else leftPairs.set(pair, count - 1);
  }
  return (2 * intersection) / (left.length + right.length - 2);
}

export function searchQueryVariants(value: string): string[] {
  const source = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const output: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string): void => {
    const clean = candidate
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[-–—－:：~～|｜]+|[-–—－:：~～|｜]+$/gu, "");
    const key = normalizeSearchComparable(clean);
    if (!clean || key.length < 2 || seen.has(key)) return;
    seen.add(key);
    output.push(clean);
  };

  add(source);
  const withoutSeason = source
    .replace(/\s*第\s*[0-9〇零一二兩两三四五六七八九十]+\s*(?:季|期|部)\s*/gu, " ")
    .replace(/\s*\b(?:season|series|part|cour)\s*[0-9]+\b\s*/giu, " ")
    .replace(/\s*\b[0-9]+(?:st|nd|rd|th)\s+season\b\s*/giu, " ")
    .replace(/\s*\bs\s*[0-9]+\b\s*/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
  add(withoutSeason);

  const separatorParts = withoutSeason.split(/\s*[-–—－:：~～|｜]\s*/u).filter(Boolean);
  if (separatorParts.length > 1) {
    add(separatorParts[0]);
    add(separatorParts.slice(1).join(" "));
  }
  const spacedParts = withoutSeason.split(/\s+/u).filter(Boolean);
  if (spacedParts.length > 1 && /\p{Script=Han}/u.test(spacedParts[0])) {
    add(spacedParts[0]);
    add(spacedParts.slice(1).join(" "));
  }
  return output.slice(0, 3);
}

function resultTitles(result: ExternalMediaResult): string[] {
  return [
    result.title,
    result.originalTitle,
    result.romajiTitle,
    ...(result.searchTitles ?? []),
  ].map((title) => title.trim()).filter(Boolean);
}

export function scoreSearchResult(
  result: ExternalMediaResult,
  query: string,
  relatedQueries: string[] = [],
): number {
  const queries = [...searchQueryVariants(query), ...relatedQueries]
    .map((candidate) => ({ raw: candidate, key: normalizeSearchComparable(candidate) }))
    .filter((candidate, index, values) => candidate.key && values.findIndex((value) => value.key === candidate.key) === index);
  const titles = resultTitles(result);
  let score = 0;
  for (const title of titles) {
    const titleKey = normalizeSearchComparable(title);
    if (!titleKey) continue;
    queries.forEach((candidate, queryIndex) => {
      const priorityPenalty = Math.min(queryIndex, 5) * 3;
      if (titleKey === candidate.key) score = Math.max(score, 120 - priorityPenalty);
      else if (titleKey.includes(candidate.key) || candidate.key.includes(titleKey)) {
        score = Math.max(score, 82 - priorityPenalty);
      } else {
        const similarity = diceCoefficient(titleKey, candidate.key);
        if (similarity >= 0.72) score = Math.max(score, 64 - priorityPenalty);
        else if (similarity >= 0.5) score = Math.max(score, 42 - priorityPenalty);
      }
    });
  }

  const requestedSeason = extractSeasonNumber(query);
  if (requestedSeason != null) {
    const seasons = titles.map(extractSeasonNumber).filter((season): season is number => season != null);
    if (seasons.includes(requestedSeason)) score += 100;
    else if (seasons.length) score -= 100;
  }
  const requestedPart = extractPartNumber(query);
  if (requestedPart != null) {
    const parts = titles.map(extractPartNumber).filter((part): part is number => part != null);
    if (parts.includes(requestedPart)) score += 70;
    else if (parts.length) score -= 70;
  }
  const requestedEditions = editionMarkers(query);
  if (requestedEditions.size) {
    const resultEditions = new Set(titles.flatMap((title) => [...editionMarkers(title)]));
    if ([...requestedEditions].every((marker) => resultEditions.has(marker))) score += 60;
    else if (resultEditions.size) score -= 60;
  }
  return score;
}

export function rankSearchResults(
  results: ExternalMediaResult[],
  query: string,
  relatedQueries: string[] = [],
): ExternalMediaResult[] {
  return results
    .map((result, index) => ({ result, index, score: scoreSearchResult(result, query, relatedQueries) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ result }) => result);
}

export function filterRelevantSearchResults(
  results: ExternalMediaResult[],
  query: string,
  relatedQueries: string[] = [],
): ExternalMediaResult[] {
  const ranked = results
    .map((result, index) => ({ result, index, score: scoreSearchResult(result, query, relatedQueries) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const relevant = ranked.filter((entry) => entry.score >= 36);
  const selected = relevant.length ? [...relevant] : [];
  for (const entry of ranked) {
    if (selected.some((candidate) => candidate.index === entry.index)) continue;
    if (selected.length >= 8) break;
    selected.push(entry);
  }
  return selected
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ result }) => result);
}
