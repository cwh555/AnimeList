export type ReleaseTrackingProvider = "mangadex" | "ndl-jpro";
export type NdlCatalog = "jpro-book" | "ndl-national";

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
  catalog?: NdlCatalog;
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
  alternativeTitles?: string[];
  catalog?: NdlCatalog;
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
  const catalogValue = stringValue(frontmatter.release_tracking_catalog);
  const catalog: NdlCatalog | undefined = catalogValue === "jpro-book" || catalogValue === "ndl-national"
    ? catalogValue
    : undefined;
  const binding: ReleaseTrackingBinding | null = provider ? {
    provider,
    sourceId: stringValue(frontmatter.release_tracking_ref) || undefined,
    title: stringValue(frontmatter.release_tracking_title) || undefined,
    creator: stringValue(frontmatter.release_tracking_creator) || undefined,
    publisher: stringValue(frontmatter.release_tracking_publisher) || undefined,
    imprint: stringValue(frontmatter.release_tracking_imprint) || undefined,
    catalog,
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

export function latestPrimaryMangaChapter(labels: unknown[]): string {
  const numeric = labels
    .map((value) => stringValue(value))
    .filter((label) => numericChapterParts(label) !== null);
  const latest = latestNumericChapter(numeric);
  const parts = numericChapterParts(latest);
  if (!latest || !parts || parts.length === 1) return latest;

  // MangaDex often numbers a volume extra/omake as a decimal attached to the
  // final serialized chapter (for example 281.1 after Chapter 281). When the
  // exact whole-number base is also present, that decimal is supplementary
  // rather than a newer main chapter. Do not globally discard decimals: a
  // series whose feed genuinely has only decimal numbering still keeps it.
  const base = String(parts[0]);
  return numeric.includes(base) ? base : latest;
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

function individualTitleStrength(actualValue: unknown, volumeValue: unknown, expected: unknown): 0 | 1 | 2 {
  const direct = publicationTitleStrength(actualValue, expected);
  if (direct === 2) return 2;
  const actual = normalizeTrackingText(actualValue);
  const volume = normalizeTrackingText(volumeValue);
  const expectedTitle = normalizeTrackingText(expected);
  if (!actual || !volume || !expectedTitle || !actual.startsWith(expectedTitle)) return direct;
  const remainder = actual.slice(expectedTitle.length);
  // Bibliographic title fields frequently append the volume and then a subtitle
  // (e.g. `オーバーロード16半森妖精の神人下`). If the text immediately
  // after the expected base title begins with the structured volume field, it
  // is still the same publication line. Derived titles such as
  // `とらドラ・スピンオフ3` do not satisfy this because their remainder
  // begins with the derived-series marker rather than the volume.
  if (remainder.startsWith(volume)) return 2;
  if (actual.endsWith(volume) && actual.slice(0, -volume.length) === expectedTitle) return 2;
  return direct;
}

function publicationRecordTitleStrength(record: NdlPublicationRecord, expected: unknown): 0 | 1 | 2 {
  let best: 0 | 1 | 2 = individualTitleStrength(record.title, record.volume, expected);
  for (const alternative of record.alternativeTitles ?? []) {
    const strength = individualTitleStrength(alternative, record.volume, expected);
    if (strength > best) best = strength;
    if (best === 2) break;
  }
  return best;
}

function matchingExpectedTitle(record: NdlPublicationRecord, titles: readonly string[]): { title: string; strength: 1 | 2 } | null {
  let best: { title: string; strength: 1 | 2 } | null = null;
  for (const title of titles) {
    const strength = publicationRecordTitleStrength(record, title);
    if (strength > (best?.strength ?? 0)) best = { title: title.trim(), strength: strength as 1 | 2 };
  }
  return best;
}

export function isSidePublication(record: NdlPublicationRecord): boolean {
  const value = `${record.title} ${record.volume}`.normalize("NFKC");
  return /(短編(?:集)?|短篇(?:集)?|\bsss?\d*\b|\bex\s*\d+(?:\.\d+)?\b|\balter\s*[.\s-]?\s*\d+\b|外伝|番外(?:編)?|アンソロジ|公式ガイド|公式ファンブック|ファンブック|ショートストーリ|art\s*works|蛇足編|スピンオフ|spin[\s-]*off|side[\s-]*stor(?:y|ies))/i
    .test(value);
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
    // Prefix matches are useful for manual discovery, but they must never be
    // collapsed into the exact-title publication line. Otherwise a derived
    // title such as "とらドラ・スピンオフ3" can contaminate the main
    // "とらドラ!" line simply because it shares author and imprint.
    const groupedTitle = titleMatch.strength === 2 ? titleMatch.title : record.title.trim();
    const key = `${normalizeTrackingText(groupedTitle)}\u0000${normalizeTrackingText(imprint)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.records.push(record);
      existing.titleStrength = Math.max(existing.titleStrength, titleMatch.strength) as 1 | 2;
      if (!existing.publisher && record.publisher) existing.publisher = record.publisher;
      continue;
    }
    groups.set(key, {
      title: groupedTitle,
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

export function mergeCompatibleNovelPublicationLines(
  lines: readonly NdlPublicationLine[],
): NdlPublicationLine[] {
  const output: NdlPublicationLine[] = [];
  const byIdentity = new Map<string, NdlPublicationLine[]>();
  for (const line of lines) {
    const creator = normalizeTrackingText(line.creator);
    const key = `${normalizeTrackingText(line.title)}\u0000${creator}`;
    const bucket = byIdentity.get(key) ?? [];
    bucket.push({ ...line, records: [...line.records] });
    byIdentity.set(key, bucket);
  }

  for (const bucket of byIdentity.values()) {
    const exact = bucket.filter((line) => line.titleStrength === 2);
    const prefix = bucket.filter((line) => line.titleStrength !== 2);
    const nonEmptyImprints = [...new Set(exact.map((line) => normalizeTrackingText(line.imprint)).filter(Boolean))];

    // Some NDL/JPRO records omit seriesTitle while other records in the same
    // exact-title/creator publication line carry the actual light-novel imprint.
    // Merge the blank-imprint fragment only when there is exactly one possible
    // non-empty imprint; if two distinct imprints exist, keeping it separate is
    // safer than silently assigning it to the wrong edition.
    if (nonEmptyImprints.length <= 1 && exact.length > 1) {
      const targetImprint = nonEmptyImprints[0] ?? "";
      const compatible = exact.filter((line) => {
        const imprint = normalizeTrackingText(line.imprint);
        return !imprint || imprint === targetImprint;
      });
      if (compatible.length > 1) {
        const preferred = compatible.find((line) => normalizeTrackingText(line.imprint) === targetImprint) ?? compatible[0];
        const merged: NdlPublicationLine = {
          ...preferred,
          records: [],
          medium: compatible.some((line) => line.medium === "novel") ? "novel" : preferred.medium,
          publisher: preferred.publisher || compatible.find((line) => line.publisher)?.publisher || "",
          imprint: preferred.imprint || compatible.find((line) => line.imprint)?.imprint || "",
        };
        const seen = new Set<string>();
        for (const line of compatible) {
          for (const record of line.records) {
            const key = record.isbn || record.sourceId || `${record.title}\u0000${record.volume}\u0000${record.publishedAt}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.records.push(record);
          }
        }
        output.push(merged);
        for (const line of exact) if (!compatible.includes(line)) output.push(line);
        output.push(...prefix);
        continue;
      }
    }
    output.push(...bucket);
  }
  return output;
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
  // Automatic binding is deliberately stricter than candidate discovery. A
  // creator/imprint match does not make a prefix-derived title the same work.
  // Prefix-only lines stay available for human review but are never auto-bound.
  if (best.titleStrength !== 2) return null;
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
  if (binding.title && publicationRecordTitleStrength(record, binding.title) !== 2) return false;
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
  const candidates = records
    .filter((record) => record.volume.trim() && recordMatchesBinding(record, binding) && isPublishedBy(record, now));
  if (!candidates.length) return null;

  // Purely numeric publication lines are monotonic by volume number. Selecting
  // by publication date alone is unsafe because reprints/special editions of an
  // older volume can be issued later than the actual latest main volume.
  const numeric = candidates.map((record) => ({ record, parts: numericChapterParts(record.volume) }));
  if (numeric.every((entry) => entry.parts !== null)) {
    return numeric.sort((left, right) => {
      const volumeOrder = compareChapterLabels(right.record.volume, left.record.volume);
      if (volumeOrder !== 0) return volumeOrder;
      const leftDate = parsePublishedDate(left.record.publishedAt) ?? Number.MIN_SAFE_INTEGER;
      const rightDate = parsePublishedDate(right.record.publishedAt) ?? Number.MIN_SAFE_INTEGER;
      if (leftDate !== rightDate) return rightDate - leftDate;
      return right.record.sourceId.localeCompare(left.record.sourceId);
    })[0]?.record ?? null;
  }

  // Complex labels such as `3年生編4` do not have a universally safe lexical
  // ordering, so chronology remains the conservative fallback for those lines.
  return candidates.sort((left, right) => {
    const leftDate = parsePublishedDate(left.publishedAt) ?? Number.MIN_SAFE_INTEGER;
    const rightDate = parsePublishedDate(right.publishedAt) ?? Number.MIN_SAFE_INTEGER;
    if (leftDate !== rightDate) return rightDate - leftDate;
    return right.sourceId.localeCompare(left.sourceId);
  })[0] ?? null;
}

export function sidePublicationsAfter(
  records: readonly NdlPublicationRecord[],
  binding: ReleaseTrackingBinding,
  main: NdlPublicationRecord,
  now: Date,
): NdlPublicationRecord[] {
  const mainDate = parsePublishedDate(main.publishedAt);
  if (mainDate === null) return [];
  return records
    .filter((record) => {
      if (!record.volume.trim() || !isSidePublication(record) || !isPublishedBy(record, now)) return false;
      if (binding.title && publicationTitleStrength(record.title, binding.title) === 0) return false;
      if (binding.creator && !record.creators.some((value) => creatorMatches(binding.creator, value))) return false;
      if (binding.imprint) {
        const imprint = publicationImprint(record.seriesTitle);
        if (imprint && normalizeTrackingText(imprint) !== normalizeTrackingText(binding.imprint)) return false;
      }
      const publishedAt = parsePublishedDate(record.publishedAt);
      return publishedAt !== null && publishedAt > mainDate;
    })
    .sort((left, right) => (parsePublishedDate(right.publishedAt) ?? 0) - (parsePublishedDate(left.publishedAt) ?? 0));
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
  const previousNumeric = numericChapterParts(previousLatest);
  const nextNumeric = numericChapterParts(nextLatest);
  if (previousNumeric && nextNumeric) return compareChapterLabels(nextLatest, previousLatest) < 0;
  const previousTimestamp = parsePublishedDate(previousDate);
  const nextTimestamp = parsePublishedDate(nextDate);
  return previousTimestamp !== null && nextTimestamp !== null && nextTimestamp < previousTimestamp;
}
