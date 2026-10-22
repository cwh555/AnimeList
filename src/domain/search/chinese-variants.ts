import { convertChineseScriptForReview } from "../chinese-title-conversion";

const GENERIC_MEDIA_WORDS = /(?:輕小說|轻小说|漫畫|漫画|動畫|动画|動漫|动漫|小說|小说|作品|系列|裡的|里的|中的)/gu;

export function traditionalToSimplifiedQuery(value: string): string {
  return convertChineseScriptForReview(value, "zh-CN") ?? value;
}

function cleanQuery(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\([^)]*\)|（[^）]*）/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function significantChineseTitle(value: string): string {
  return cleanQuery(value)
    .replace(GENERIC_MEDIA_WORDS, "")
    .replace(/第\s*[0-9〇零一二兩两三四五六七八九十]+\s*(?:季|期|部)/gu, "")
    .replace(/[^\p{Script=Han}]+/gu, "");
}

export function collectChineseDiscoveryQueries(value: string, limit = 5): string[] {
  const source = cleanQuery(value);
  if (!/\p{Script=Han}/u.test(source) || limit <= 0) return [];

  const output: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string): void => {
    const clean = cleanQuery(candidate);
    const key = clean.replace(/[\s\p{P}\p{S}]+/gu, "").toLocaleLowerCase();
    if (!clean || key.length < 2 || seen.has(key)) return;
    seen.add(key);
    output.push(clean);
  };

  const simplified = traditionalToSimplifiedQuery(source);
  const significant = significantChineseTitle(source);
  const simplifiedSignificant = traditionalToSimplifiedQuery(significant);

  add(simplified);
  // More discriminative than short two-character suffixes: first retain the
  // meaningful core in Simplified Chinese (Bangumi's primary search corpus).
  if (significant.length >= 6) {
    const chars = [...significant];
    add(traditionalToSimplifiedQuery(chars.slice(2, 6).join("")));
    add(traditionalToSimplifiedQuery(chars.slice(1, 6).join("")));
  }
  add(simplifiedSignificant);
  add(significant);

  for (const candidate of [simplifiedSignificant, significant]) {
    const characters = [...candidate];
    if (characters.length > 3) add(characters.slice(-3).join(""));
    if (characters.length > 2) add(characters.slice(-2).join(""));
  }

  return output.slice(0, limit);
}
