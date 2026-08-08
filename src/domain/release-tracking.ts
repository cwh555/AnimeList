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

export interface NdlPublicationLine {
  title: string;
  creator: string;
  publisher: string;
  records: NdlPublicationRecord[];
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function normalizeTrackingText(value: unknown): string {
  return stringValue(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\u3000·・:：!！?？'"“”‘’()（）[\]【】{}<>〈〉《》「」『』,，.。\-—_]/g, "");
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
  const exact = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (exact) {
    const timestamp = Date.UTC(Number(exact[1]), Number(exact[2]) - 1, Number(exact[3]));
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  const month = text.match(/^(\d{4})-(\d{2})/);
  if (month) {
    const timestamp = Date.UTC(Number(month[1]), Number(month[2]) - 1, 1);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  const year = text.match(/^(\d{4})$/);
  if (year) return Date.UTC(Number(year[1]), 0, 1);
  return null;
}

export function isPublishedBy(record: NdlPublicationRecord, now: Date): boolean {
  const timestamp = parsePublishedDate(record.publishedAt);
  if (timestamp === null) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return timestamp <= today;
}

function candidateSeriesTitle(record: NdlPublicationRecord): string {
  if (record.seriesTitle.trim()) return record.seriesTitle.trim();
  const title = record.title.trim();
  const volume = record.volume.trim();
  if (!volume) return title;
  const normalizedTitle = normalizeTrackingText(title);
  const normalizedVolume = normalizeTrackingText(volume);
  if (!normalizedVolume || !normalizedTitle.endsWith(normalizedVolume)) return title;
  const rawIndex = title.lastIndexOf(volume);
  return rawIndex > 0 ? title.slice(0, rawIndex).trim().replace(/[\s\u3000:：\-—]+$/, "") : title;
}

export function publicationRecordMatchesTitles(
  record: NdlPublicationRecord,
  titles: readonly string[],
): boolean {
  const expected = new Set(titles.map(normalizeTrackingText).filter(Boolean));
  if (!expected.size) return false;
  return [candidateSeriesTitle(record), record.seriesTitle, record.title]
    .map(normalizeTrackingText)
    .some((value) => value !== "" && expected.has(value));
}

export function publicationLineKey(record: NdlPublicationRecord): string {
  const title = normalizeTrackingText(candidateSeriesTitle(record));
  const creator = normalizeTrackingText(record.creators[0] ?? "");
  const publisher = normalizeTrackingText(record.publisher);
  return `${title}\u0000${creator}\u0000${publisher}`;
}

export function groupPublicationLines(
  records: readonly NdlPublicationRecord[],
  titles: readonly string[],
): NdlPublicationLine[] {
  const groups = new Map<string, NdlPublicationLine>();
  for (const record of records) {
    if (!record.volume.trim() || !publicationRecordMatchesTitles(record, titles)) continue;
    const key = publicationLineKey(record);
    if (!key.replaceAll("\u0000", "")) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.records.push(record);
      continue;
    }
    groups.set(key, {
      title: candidateSeriesTitle(record),
      creator: record.creators[0] ?? "",
      publisher: record.publisher,
      records: [record],
    });
  }
  return [...groups.values()];
}

export function recordMatchesBinding(
  record: NdlPublicationRecord,
  binding: ReleaseTrackingBinding,
): boolean {
  if (binding.provider !== "ndl-jpro") return false;
  const title = normalizeTrackingText(binding.title);
  const creator = normalizeTrackingText(binding.creator);
  const publisher = normalizeTrackingText(binding.publisher);
  if (title && normalizeTrackingText(candidateSeriesTitle(record)) !== title) return false;
  if (creator && !record.creators.some((value) => normalizeTrackingText(value) === creator)) return false;
  if (publisher && normalizeTrackingText(record.publisher) !== publisher) return false;
  return Boolean(title || creator || publisher);
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
