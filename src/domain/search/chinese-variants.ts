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
  add(significant);
  add(simplifiedSignificant);

  // Prefer meaningful interior fragments before very short suffixes. This
  // recovers alternate title wording (e.g. 我想成為影之強者 versus
  // 想成為影之實力者) without a hard-coded dictionary of individual works.
  if ([...significant].length >= 7) {
    const chars = [...significant];
    for (const start of [1, 2]) {
      const fragment = chars.slice(start, start + 5).join("");
      if ([...fragment].length < 5) continue;
      add(fragment);
      add(traditionalToSimplifiedQuery(fragment));
    }
  }

  for (const candidate of [significant, simplifiedSignificant]) {
    const characters = [...candidate];
    if (characters.length > 3) add(characters.slice(-3).join(""));
    if (characters.length > 2) add(characters.slice(-2).join(""));
  }

  return output.slice(0, limit);
}
