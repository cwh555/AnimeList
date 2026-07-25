import type { NovelVolumeEntry } from "./types";

export interface SerialCoverCandidate {
  provider: string;
  sourceId: string;
  title: string;
  coverUrl: string;
  infoUrl: string;
}

export interface RankedSerialCoverCandidate extends SerialCoverCandidate {
  score: number;
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

function labelPattern(label: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^0-9])${escaped}(?:[^0-9]|$)`);
}

export function scoreSerialCoverCandidate(
  candidate: SerialCoverCandidate,
  originalTitle: string,
  label: string,
): number {
  if (!candidate.coverUrl) return Number.NEGATIVE_INFINITY;
  const titleKey = comparable(originalTitle);
  const candidateKey = comparable(candidate.title);
  let score = 0;
  if (candidateKey.startsWith(titleKey)) score += 70;
  else if (candidateKey.includes(titleKey)) score += 52;
  else return Number.NEGATIVE_INFINITY;

  if (labelPattern(label).test(clean(candidate.title))) score += 35;
  else score -= 45;
  if (/限定|特装|特裝|special|limited|box|セット|合本|合訂/i.test(candidate.title)) score -= 18;
  return score;
}

export function rankSerialCoverCandidates(
  candidates: SerialCoverCandidate[],
  originalTitle: string,
  label: string,
): RankedSerialCoverCandidate[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreSerialCoverCandidate(candidate, originalTitle, label),
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
