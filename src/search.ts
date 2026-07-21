import type { ExternalMediaResult } from "./types";

const CHINESE_NUMBER_DIGITS = new Map<string, number>([
  ["〇", 0], ["零", 0], ["一", 1], ["二", 2], ["兩", 2], ["两", 2], ["三", 3], ["四", 4],
  ["五", 5], ["六", 6], ["七", 7], ["八", 8], ["九", 9],
]);

function normalizeComparable(value: string): string {
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
  const chinese = text.match(/第\s*([0-9〇零一二兩两三四五六七八九十]+)\s*(?:季|期|部)/u);
  if (chinese) return chineseNumberValue(chinese[1]);
  const english = text.match(/\b(?:season|series)\s*([0-9]+)\b/u)
    ?? text.match(/\bs\s*([0-9]+)\b/u);
  return english ? Number(english[1]) : null;
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
    const key = normalizeComparable(clean);
    if (!clean || key.length < 2 || seen.has(key)) return;
    seen.add(key);
    output.push(clean);
  };

  add(source);
  const withoutSeason = source
    .replace(/\s*第\s*[0-9〇零一二兩两三四五六七八九十]+\s*(?:季|期|部)\s*/gu, " ")
    .replace(/\s*\b(?:season|series)\s*[0-9]+\b\s*/giu, " ")
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

export function rankSearchResults(
  results: ExternalMediaResult[],
  query: string,
): ExternalMediaResult[] {
  const queryKeys = searchQueryVariants(query).map(normalizeComparable).filter(Boolean);
  const exactKey = queryKeys[0] ?? "";
  const requestedSeason = extractSeasonNumber(query);
  return results
    .map((result, index) => {
      const titles = [
        result.title,
        result.originalTitle,
        result.romajiTitle,
        ...(result.searchTitles ?? []),
      ].map((title) => title.trim()).filter(Boolean);
      let score = 0;
      for (const title of titles) {
        const titleKey = normalizeComparable(title);
        if (!titleKey) continue;
        if (titleKey === exactKey) score = Math.max(score, 120);
        else if (exactKey && (titleKey.includes(exactKey) || exactKey.includes(titleKey))) {
          score = Math.max(score, 80);
        }
        queryKeys.slice(1).forEach((queryKey, variantIndex) => {
          if (queryKey && (titleKey.includes(queryKey) || queryKey.includes(titleKey))) {
            score = Math.max(score, 48 - variantIndex * 6);
          }
        });
      }
      if (requestedSeason != null) {
        const seasons = titles
          .map(extractSeasonNumber)
          .filter((season): season is number => season != null);
        if (seasons.includes(requestedSeason)) score += 100;
        else if (seasons.length) score -= 30;
      }
      return { result, index, score };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ result }) => result);
}
