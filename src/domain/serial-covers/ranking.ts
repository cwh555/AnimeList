import { collectChineseDiscoveryQueries, traditionalToSimplifiedQuery } from "../search/chinese-variants";
import type { MediaType, NovelVolumeEntry } from "../../types";

export interface SerialCoverCandidate {
  provider: string;
  sourceId: string;
  title: string;
  coverUrl: string;
  infoUrl: string;
  categories?: string[];
  authors?: string[];
  publisher?: string;
  mediaTypeHint?: Extract<MediaType, "manga" | "novel">;
}

export interface RankedSerialCoverCandidate extends SerialCoverCandidate {
  score: number;
}

export interface SerialCoverManualQuery {
  query: string;
  title: string;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
}

function comparable(value: unknown): string {
  return clean(value).toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function hasKana(value: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
}

function hasHangul(value: string): boolean {
  return /\p{Script=Hangul}/u.test(value);
}

function hasCjk(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}

export function isLikelyOriginalTitle(value: unknown): value is string {
  const title = clean(value);
  return Boolean(title) && (hasKana(title) || hasHangul(title));
}

export function selectOriginalTitle(
  originalTitle: unknown,
  aliases: unknown,
): string | null {
  const direct = clean(originalTitle);
  if (isLikelyOriginalTitle(direct)) return direct;
  const values = Array.isArray(aliases) ? aliases : aliases == null ? [] : [aliases];
  for (const value of values) {
    const candidate = clean(value);
    if (isLikelyOriginalTitle(candidate)) return candidate;
  }
  return direct && hasCjk(direct) ? direct : null;
}

export function serialCoverQuery(originalTitle: string, label: string): string | null {
  const title = clean(originalTitle);
  const normalizedLabel = clean(label);
  if (!title || !/^\d+(?:\.5)?$/.test(normalizedLabel)) return null;
  return `${title} ${normalizedLabel}`;
}

export function normalizeManualSerialCoverQuery(
  value: unknown,
  label: string,
): SerialCoverManualQuery | null {
  const input = clean(value);
  const normalizedLabel = clean(label);
  if (!input || !/^\d+(?:\.5)?$/.test(normalizedLabel)) return null;
  const escaped = normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const suffix = new RegExp(`\\s*[（(]?${escaped}[）)]?\\s*$`);
  const title = clean(input.replace(suffix, "")) || input;
  const query = serialCoverQuery(title, normalizedLabel);
  return query ? { query, title } : null;
}

export function serialCoverQueries(originalTitle: string, label: string): string[] {
  const exact = serialCoverQuery(originalTitle, label);
  if (!exact) return [];
  const title = clean(originalTitle);
  const normalizedLabel = clean(label);
  const separator = title.search(/[～〜~]/u);
  if (separator <= 0) return [exact];
  const shortTitle = clean(title.slice(0, separator));
  if (comparable(shortTitle).length < 3 || comparable(shortTitle) === comparable(title)) return [exact];
  return [exact, `${shortTitle} ${normalizedLabel}`];
}

export function manualSerialCoverQueries(title: string, label: string): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string | null): void => {
    const value = clean(candidate);
    const key = comparable(value);
    if (!value || !key || seen.has(key)) return;
    seen.add(key);
    output.push(value);
  };

  for (const candidate of serialCoverQueries(title, label)) add(candidate);

  const compact = traditionalToSimplifiedQuery(clean(title))
    .replace(/(?:關於|关于|关於|關于|這件事|这件事|不時|不时|有時|有时|同學|同学|的|我|被|以)/gu, "")
    .replace(/[^\p{Script=Han}]+/gu, "");
  const characters = [...compact];
  if (characters.length >= 4) {
    add(serialCoverQuery(characters.slice(0, 4).join(""), label));
    add(serialCoverQuery(characters.slice(-4).join(""), label));
  }

  for (const variant of collectChineseDiscoveryQueries(title, 3)) {
    add(serialCoverQuery(variant, label));
  }
  return output;
}

function labelPattern(label: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`);
}

export function scoreSerialCoverCandidate(
  candidate: SerialCoverCandidate,
  originalTitle: string,
  label: string,
  mediaType?: Extract<MediaType, "manga" | "novel">,
): number {
  if (!candidate.coverUrl) return Number.NEGATIVE_INFINITY;
  if (mediaType && candidate.mediaTypeHint && candidate.mediaTypeHint !== mediaType) {
    return Number.NEGATIVE_INFINITY;
  }

  const titleKey = comparable(originalTitle);
  const candidateKey = comparable(candidate.title);
  const labelKey = comparable(label);
  let score = 0;
  if (candidateKey.startsWith(titleKey)) score += 70;
  else if (candidateKey.includes(titleKey)) score += 42;
  else return Number.NEGATIVE_INFINITY;

  const explicitVolume = labelPattern(label).test(clean(candidate.title));
  const implicitFirstVolume = label === "1" && candidateKey === titleKey;
  if (explicitVolume) score += 40;
  else if (implicitFirstVolume) score += 28;
  else return Number.NEGATIVE_INFINITY;

  if (candidateKey.startsWith(`${titleKey}${labelKey}`)) score += 35;
  else if (!implicitFirstVolume && candidateKey.startsWith(titleKey)) score -= 28;
  if (candidateKey === `${titleKey}${labelKey}`) score += 15;

  if (/限定|特装|特裝|special|limited|box|セット|合本|合訂|スピンオフ|エクストラ|かっぽれ|ファンタスティックデイズ|よりみち|転スラ日記|転ちゅら|異聞|番外編|魔物の国の歩き方|美食伝|クレイマン/i.test(candidate.title)) {
    score -= 40;
  }

  if (mediaType && candidate.mediaTypeHint === mediaType) score += 45;
  const categories = (candidate.categories ?? []).join(" ").toLocaleLowerCase();
  const metadata = [categories, candidate.publisher ?? "", ...(candidate.authors ?? [])].join(" ").toLocaleLowerCase();
  const lightNovel = /light\s*novel|ライトノベル|文庫|小说|小説/.test(metadata);
  const comics = /manga|comics|graphic novels|コミック|漫画/.test(metadata);
  if (mediaType === "novel") {
    if (lightNovel) score += 22;
    else if (comics) score -= 28;
  } else if (mediaType === "manga") {
    if (comics && !lightNovel) score += 18;
    else if (lightNovel) score -= 18;
  }
  return score;
}

export function rankSerialCoverCandidates(
  candidates: SerialCoverCandidate[],
  originalTitle: string,
  label: string,
  mediaType?: Extract<MediaType, "manga" | "novel">,
): RankedSerialCoverCandidate[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreSerialCoverCandidate(candidate, originalTitle, label, mediaType),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
}


function manualTitleSimilarity(candidateTitle: string, queryTitle: string): number {
  const candidateKey = comparable(candidateTitle);
  const queryKey = comparable(queryTitle);
  if (!candidateKey || !queryKey) return 0;
  if (candidateKey === queryKey) return 100;
  if (candidateKey.startsWith(queryKey)) return 82;
  if (candidateKey.includes(queryKey)) return 70;
  if (queryKey.includes(candidateKey)) return 52;
  const queryCharacters = new Set(queryKey);
  let shared = 0;
  for (const character of new Set(candidateKey)) {
    if (queryCharacters.has(character)) shared += 1;
  }
  return Math.round(35 * shared / Math.max(1, queryCharacters.size));
}

export function scoreManualSerialCoverCandidate(
  candidate: SerialCoverCandidate,
  queryTitle: string,
  label: string,
  mediaType?: Extract<MediaType, "manga" | "novel">,
  referenceTitle?: string,
): number {
  if (!candidate.coverUrl) return Number.NEGATIVE_INFINITY;
  let score = Math.max(
    manualTitleSimilarity(candidate.title, queryTitle),
    manualTitleSimilarity(candidate.title, referenceTitle ?? ""),
  );
  if (labelPattern(label).test(clean(candidate.title))) score += 44;
  else if (label === "1" && [queryTitle, referenceTitle].some((title) => (
    comparable(candidate.title) === comparable(title)
  ))) score += 18;
  else if (/\d+(?:\.5)?/u.test(clean(candidate.title))) score -= 12;
  if (mediaType && candidate.mediaTypeHint === mediaType) score += 36;
  else if (mediaType && candidate.mediaTypeHint && candidate.mediaTypeHint !== mediaType) score -= 10;
  return score;
}

export function rankManualSerialCoverCandidates(
  candidates: SerialCoverCandidate[],
  queryTitle: string,
  label: string,
  mediaType?: Extract<MediaType, "manga" | "novel">,
  referenceTitle?: string,
): RankedSerialCoverCandidate[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreManualSerialCoverCandidate(candidate, queryTitle, label, mediaType, referenceTitle),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
}
export function confidentSerialCover(
  candidates: RankedSerialCoverCandidate[],
): RankedSerialCoverCandidate | null {
  const first = candidates[0];
  if (!first || first.score < 88) return null;
  const second = candidates[1];
  return !second || first.score - second.score >= 8 ? first : null;
}

export function mergeSerialEntryCover(
  entry: NovelVolumeEntry,
  cover: Pick<NovelVolumeEntry, "cover" | "coverProvider" | "coverSourceId">,
): NovelVolumeEntry {
  return {
    ...entry,
    cover: cover.cover || undefined,
    coverProvider: cover.coverProvider || undefined,
    coverSourceId: cover.coverSourceId || undefined,
  };
}
