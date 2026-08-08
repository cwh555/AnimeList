export type ReleaseTrackingProvider = "mangadex" | "ndl-jpro";

export type ReleaseTrackingStatus =
  | "unconfigured"
  | "verified"
  | "ambiguous"
  | "unmatched"
  | "provider_error"
  | "source_regressed"
  | "disabled";

export interface ReleaseTrackingBinding {
  provider: ReleaseTrackingProvider;
  sourceId?: string;
  title?: string;
  creator?: string;
  publisher?: string;
  imprint?: string;
}

export interface ReleaseTrackingSnapshot {
  status: ReleaseTrackingStatus;
  binding: ReleaseTrackingBinding | null;
  latest: string;
  latestReleaseDate: string;
  checkedAt: string;
  error: string;
}

export interface NdlPublicationRecord {
  sourceId: string;
  sourceUrl: string;
  title: string;
  seriesTitle: string;
  volume: string;
  creators: string[];
  publisher: string;
  publishedAt: string;
  isbn: string;
}

export type NdlPublicationMedium = "novel" | "comic" | "unknown";

export interface NdlPublicationLine {
  title: string;
  creator: string;
  publisher: string;
  imprint: string;
  medium: NdlPublicationMedium;
  titleStrength: 1 | 2;
  records: NdlPublicationRecord[];
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function normalizeTrackingText(value: unknown): string {
  return stringValue(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\u3000·・:：!！?？'"“”‘’()（）[\]【】{}<>〈〉《》「」『』,，.。\-—_~～]/g, "");
}

export function normalizeReleaseTrackingStatus(value: unknown): ReleaseTrackingStatus {
  return value === "verified"
    || value === "ambiguous"
    || value === "unmatched"
    || value === "provider_error"
    || value === "source_regressed"
    || value === "disabled"
    ? value
    : "unconfigured";
}

export function releaseTrackingSnapshotFromFrontmatter(
  frontmatter: Record<string, unknown>,
  mediaType: "manga" | "novel" | "anime",
): ReleaseTrackingSnapshot {
  const providerValue = stringValue(frontmatter.release_tracking_provider);
  const provider: ReleaseTrackingProvider | null = providerValue === "mangadex" || providerValue === "ndl-jpro"
    ? providerValue
    : null;
  const latest = mediaType === "manga"
    ? stringValue(frontmatter.latest_chapter)
    : mediaType === "novel"
      ? stringValue(frontmatter.latest_volume)
      : "";
  const binding = provider ? {
    provider,
    sourceId: stringValue(frontmatter.release_tracking_ref) || undefined,
    title: stringValue(frontmatter.release_tracking_title) || undefined,
    creator: stringValue(frontmatter.release_tracking_creator) || undefined,
    publisher: stringValue(frontmatter.release_tracking_publisher) || undefined,
    imprint: stringValue(frontmatter.release_tracking_imprint) || undefined,
  } : null;
  return {
    status: normalizeReleaseTrackingStatus(frontmatter.release_tracking_status),
    binding,
    latest,
    latestReleaseDate: stringValue(frontmatter.latest_release_date),
    checkedAt: stringValue(frontmatter.release_tracking_checked_at),
    error: stringValue(frontmatter.release_tracking_error),
  };
}

export function numericChapterParts(label: unknown): number[] | null {
  const value = stringValue(label);
  if (!/^\d+(?:\.\d+)*$/.test(value)) return null;
  const parts = value.split(".").map((part) => Number(part));
  return parts.every(Number.isFinite) ? parts : null;
}

export function compareChapterLabels(left: unknown, right: unknown): number {
  const a = numericChapterParts(left);
  const b = numericChapterParts(right);
  if (!a || !b) return 0;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function latestNumericChapter(labels: unknown[]): string {
  let latest = "";
  for (const value of labels) {
    const label = stringValue(value);
    if (!numericChapterParts(label)) continue;
    if (!latest || compareChapterLabels(label, latest) > 0) latest = label;
  }
  return latest;
}

export function parsePublishedDate(value: unknown): number | null {
  const text = stringValue(value);
  if (!text) return null;
  const normalized = text
    .replace(/[年/.]/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  const exact = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
  if (exact) {
    const timestamp = Date.UTC(Number(exact[1]), Number(exact[2]) - 1, Number(exact[3]));
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  const month = normalized.match(/^(\d{4})-(\d{1,2})(?:\D|$)/);
  if (month) {
    const timestamp = Date.UTC(Number(month[1]), Number(month[2]) - 1, 1);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  const year = normalized.match(/^(\d{4})$/);
  if (year) return Date.UTC(Number(year[1]), 0, 1);
  return null;
}

export function isPublishedBy(record: NdlPublicationRecord, now: Date): boolean {
  const timestamp = parsePublishedDate(record.publishedAt);
  if (timestamp === null) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return timestamp <= today;
}

export function publicationImprint(seriesTitle: unknown): string {
  return stringValue(seriesTitle).split(/[;；]/, 1)[0]?.trim() ?? "";
}

export function publicationMedium(seriesTitle: unknown): NdlPublicationMedium {
  const imprint = publicationImprint(seriesTitle);
  if (/(コミックス|コミック|漫画|マンガ)/i.test(imprint)) return "comic";
  if (/(文庫|ブックス|ノベル|novels?|新書)/i.test(imprint)) return "novel";
  return "unknown";
}

export function creatorMatches(left: unknown, right: unknown): boolean {
  const a = normalizeTrackingText(left).replace(/\d+$/g, "");
  const b = normalizeTrackingText(right).replace(/\d+$/g, "");
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

export function publicationTitleStrength(actual: unknown, expected: unknown): 0 | 1 | 2 {
  const a = normalizeTrackingText(actual);
  const e = normalizeTrackingText(expected);
  if (!a || !e) return 0;
  if (a === e) return 2;
  return a.startsWith(e) ? 1 : 0;
}

function matchingExpectedTitle(record: NdlPublicationRecord, titles: readonly string[]): { title: string; strength: 1 | 2 } | null {
  let best: { title: string; strength: 1 | 2 } | null = null;
  for (const title of titles) {
    const strength = publicationTitleStrength(record.title, title);
    if (strength > (best?.strength ?? 0)) best = { title: title.trim(), strength: strength as 1 | 2 };
  }
  return best;
}

export function isSidePublication(record: NdlPublicationRecord): boolean {
  return /(短編集|\bsss?\b|外伝|番外|アンソロジ|公式ガイド|art\s*works|蛇足編)/i
    .test(`${record.title} ${record.volume}`);
}

export function publicationRecordMatchesTitles(
  record: NdlPublicationRecord,
  titles: readonly string[],
): boolean {
  return matchingExpectedTitle(record, titles) !== null;
}

function matchingCreator(record: NdlPublicationRecord, creators: readonly string[]): string {
  if (!creators.length) return record.creators[0] ?? "";
  for (const expected of creators) {
    const actual = record.creators.find((value) => creatorMatches(expected, value));
    if (actual) return expected.trim();
  }
  return "";
}

export function groupPublicationLines(
  records: readonly NdlPublicationRecord[],
  titles: readonly string[],
  creators: readonly string[] = [],
): NdlPublicationLine[] {
  const groups = new Map<string, NdlPublicationLine>();
  for (const record of records) {
    if (!record.volume.trim() || isSidePublication(record)) continue;
    const titleMatch = matchingExpectedTitle(record, titles);
    if (!titleMatch) continue;
    const creator = matchingCreator(record, creators);
    if (creators.length && !creator) continue;
    const imprint = publicationImprint(record.seriesTitle);
    const key = `${normalizeTrackingText(titleMatch.title)}\u0000${normalizeTrackingText(imprint)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.records.push(record);
      existing.titleStrength = Math.max(existing.titleStrength, titleMatch.strength) as 1 | 2;
      if (!existing.publisher && record.publisher) existing.publisher = record.publisher;
      continue;
    }
    groups.set(key, {
      title: titleMatch.title,
      creator: creator || record.creators[0] || "",
      publisher: record.publisher,
      imprint,
      medium: publicationMedium(record.seriesTitle),
      titleStrength: titleMatch.strength,
      records: [record],
    });
  }
  return [...groups.values()];
}

function lineRank(line: NdlPublicationLine): readonly [number, number, number] {
  const mediumRank = line.medium === "novel" ? 2 : line.medium === "unknown" ? 1 : 0;
  return [line.titleStrength, mediumRank, line.records.length];
}

function compareLineRank(left: NdlPublicationLine, right: NdlPublicationLine): number {
  const a = lineRank(left);
  const b = lineRank(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? -1 : 1;
  }
  return 0;
}

export function selectSafeNovelPublicationLine(
  lines: readonly NdlPublicationLine[],
  hasCreatorEvidence: boolean,
): NdlPublicationLine | null {
  const nonComic = lines.filter((line) => line.medium !== "comic");
  if (!nonComic.length) return null;
  const ranked = [...nonComic].sort(compareLineRank);
  const best = ranked[0];
  if (!best) return null;
  if (best.titleStrength < 2 && !(hasCreatorEvidence && best.medium === "novel")) return null;
  const second = ranked[1];
  if (second && compareLineRank(best, second) === 0) return null;
  if (!hasCreatorEvidence && best.medium === "unknown") return null;
  return best;
}

export function recordMatchesBinding(
  record: NdlPublicationRecord,
  binding: ReleaseTrackingBinding,
): boolean {
  if (binding.provider !== "ndl-jpro" || isSidePublication(record)) return false;
  if (binding.title && publicationTitleStrength(record.title, binding.title) === 0) return false;
  if (binding.creator && !record.creators.some((value) => creatorMatches(binding.creator, value))) return false;
  if (binding.imprint && normalizeTrackingText(publicationImprint(record.seriesTitle)) !== normalizeTrackingText(binding.imprint)) return false;
  if (!binding.imprint && binding.publisher && normalizeTrackingText(record.publisher) !== normalizeTrackingText(binding.publisher)) return false;
  return Boolean(binding.title || binding.creator || binding.publisher || binding.imprint);
}

export function selectLatestPublishedRecord(
  records: readonly NdlPublicationRecord[],
  binding: ReleaseTrackingBinding,
  now: Date,
): NdlPublicationRecord | null {
  return records
    .filter((record) => record.volume.trim() && recordMatchesBinding(record, binding) && isPublishedBy(record, now))
    .sort((left, right) => {
      const leftDate = parsePublishedDate(left.publishedAt) ?? Number.MIN_SAFE_INTEGER;
      const rightDate = parsePublishedDate(right.publishedAt) ?? Number.MIN_SAFE_INTEGER;
      if (leftDate !== rightDate) return rightDate - leftDate;
      return right.sourceId.localeCompare(left.sourceId);
    })[0] ?? null;
}

export function providerResultRegressed(
  previousLatest: string,
  previousDate: string,
  nextLatest: string,
  nextDate: string,
  provider: ReleaseTrackingProvider,
): boolean {
  if (!previousLatest || !nextLatest) return false;
  if (provider === "mangadex") return compareChapterLabels(nextLatest, previousLatest) < 0;
  const previousTimestamp = parsePublishedDate(previousDate);
  const nextTimestamp = parsePublishedDate(nextDate);
  return previousTimestamp !== null && nextTimestamp !== null && nextTimestamp < previousTimestamp;
}
