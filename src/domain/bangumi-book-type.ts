import type { MediaType } from "./media-types";

/**
 * Bangumi groups manga and novels under Book (type=1).
 * Infer only from explicit source category fields, never from work titles.
 * Unknown or conflicting evidence must not be treated as confirmed.
 */
export function bangumiBookMediaType(
  platform: string,
  categoryTags: readonly string[] = [],
  infoboxKeys: readonly string[] = [],
): Extract<MediaType, "manga" | "novel"> | null {
  const category = platform.normalize("NFKC").trim().toLowerCase();
  const manga = /(?:漫画|漫畫|コミック|マンガ|manhwa|manhua|webtoon|manga|comic)/u;
  const novel = /(?:小说|小說|小説|ノベル|ライトノベル|文庫|文库|novel)/u;
  let mangaEvidence = manga.test(category);
  let novelEvidence = novel.test(category);
  for (const raw of categoryTags) {
    const tag = raw.normalize("NFKC").trim().toLowerCase();
    if (/^(?:漫画|漫畫|コミック|マンガ|manga|comic|webtoon)$/u.test(tag)) mangaEvidence = true;
    if (/^(?:小说|小說|小説|ライトノベル|轻小说|輕小說|novel)$/u.test(tag)) novelEvidence = true;
  }
  for (const raw of infoboxKeys) {
    const key = raw.normalize("NFKC").trim();
    if (/^(?:连载杂志|連載雜誌|掲載誌|連載誌)$/u.test(key)) mangaEvidence = true;
    if (/^(?:文庫|文库|书系|書系)$/u.test(key)) novelEvidence = true;
  }
  if (mangaEvidence === novelEvidence) return null;
  return mangaEvidence ? "manga" : "novel";
}
