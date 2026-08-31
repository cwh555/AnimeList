import type { MediaStatus, MediaStatusFilter } from "./media-status";
import type {
  MediaItem,
  MediaType,
  ProgressValue,
  ReleaseStatus,
} from "./media-types";
import type { ReadingProgressUnit } from "./progress-units";
import { buildLibraryCompletionEvents } from "./timeline/completion-events";

export const ANIMELIST_LIBRARY_EXPORT_FORMAT = "animelist-library-export" as const;
export const ANIMELIST_LIBRARY_EXPORT_VERSION = 1 as const;

export type LibraryExportFormat = "json" | "text";
export type LibraryExportMediaFilter = "all" | MediaType;

export interface LibraryExportScope {
  mediaType: LibraryExportMediaFilter;
  status: MediaStatusFilter;
}

export interface LibraryExportProgressV1 {
  current: ProgressValue;
  total?: ProgressValue;
  unit: string;
}

export interface LibraryExportSerialCoverV1 {
  path?: string;
  provider?: string;
  sourceId?: string;
  manual?: boolean;
}

export interface LibraryExportSerialEntryV1 {
  label: string;
  startedAt?: string;
  completedAt?: string;
  cover?: LibraryExportSerialCoverV1;
}

export interface LibraryExportMetadataV1 {
  year?: number | string;
  season?: string;
  seasonYear?: number | string;
  genres?: string[];
  mediaTags?: string[];
  sourceMaterial?: string;
  countryOfOrigin?: string;
  people?: string[];
  platforms?: string[];
}

export interface LibraryExportSourceV1 {
  provider?: string;
  id?: string;
  anilistId?: string;
  urls?: string[];
}

export interface LibraryExportCoverV1 {
  path?: string;
  remote?: string;
}

export interface LibraryExportRecordV1 {
  title: string;
  originalTitle?: string;
  romajiTitle?: string;
  mediaType: MediaType;
  format: string;
  status: MediaStatus;
  releaseStatus?: ReleaseStatus;
  progress: LibraryExportProgressV1;
  score?: number;
  favorite: boolean;
  dates?: {
    startedAt?: string;
    completedAt?: string;
  };
  serialEntries?: LibraryExportSerialEntryV1[];
  metadata?: LibraryExportMetadataV1;
  source?: LibraryExportSourceV1;
  notePath?: string;
  cover?: LibraryExportCoverV1;
}

export interface LibraryExportDocumentV1 {
  format: typeof ANIMELIST_LIBRARY_EXPORT_FORMAT;
  version: typeof ANIMELIST_LIBRARY_EXPORT_VERSION;
  exportedAt: string;
  records: LibraryExportRecordV1[];
}

export interface LibraryTextExportRow {
  time: string;
  work: string;
  entryLabel?: string;
  entryUnit?: ReadingProgressUnit;
  mediaType: MediaType;
  originalTitle: string;
  score: number | null;
  progressCurrent: ProgressValue;
  progressTotal?: ProgressValue;
  progressUnit: string;
  startedAt: string;
  status: MediaStatus;
  favorite: boolean;
  masterpieceLabels: string[];
  genres: string[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function eventTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function filterLibraryExportItems(
  items: readonly MediaItem[],
  scope: LibraryExportScope,
): MediaItem[] {
  return items.filter((item) => (
    (scope.mediaType === "all" || item.mediaType === scope.mediaType)
    && (scope.status === "all" || item.status === scope.status)
  ));
}

export function sortLibraryExportRecords(records: readonly LibraryExportRecordV1[]): LibraryExportRecordV1[] {
  return [...records].sort((left, right) => (
    compareText(left.mediaType, right.mediaType)
    || compareText(left.title, right.title)
    || compareText(left.notePath ?? "", right.notePath ?? "")
  ));
}

export function buildLibraryTextExportRows(items: readonly MediaItem[]): LibraryTextExportRow[] {
  return buildLibraryCompletionEvents(items)
    .map((event): LibraryTextExportRow => ({
      time: event.completedAt,
      work: event.item.title,
      entryLabel: event.serialEntry?.label,
      entryUnit: event.serialUnit,
      mediaType: event.item.mediaType,
      originalTitle: event.item.originalTitle,
      score: event.item.score,
      progressCurrent: event.item.progress,
      ...(event.item.mediaType === "anime" ? { progressTotal: event.item.total } : {}),
      progressUnit: event.item.unit,
      startedAt: event.startedAt,
      status: event.item.status,
      favorite: event.item.favorite,
      masterpieceLabels: [...(event.item.masterpieceLabels ?? [])],
      genres: [...event.item.genres],
    }))
    .sort((left, right) => (
      eventTime(left.time) - eventTime(right.time)
      || compareText(left.time, right.time)
      || compareText(left.work, right.work)
      || compareText(left.entryLabel ?? "", right.entryLabel ?? "")
    ));
}

export function serializeLibraryExportDocument(document: LibraryExportDocumentV1): string {
  return `${JSON.stringify({
    ...document,
    records: sortLibraryExportRecords(document.records),
  }, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isProgressValue(value: unknown): boolean {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function isStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((entry) => typeof entry === "string"));
}

function isReleaseStatus(value: unknown): boolean {
  return value === undefined
    || value === "releasing"
    || value === "finished"
    || value === "hiatus"
    || value === "cancelled"
    || value === "unknown";
}

function isSerialCover(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return isOptionalString(value.path)
    && isOptionalString(value.provider)
    && isOptionalString(value.sourceId)
    && (value.manual === undefined || typeof value.manual === "boolean");
}

function isSerialEntry(value: unknown): boolean {
  if (!isRecord(value) || typeof value.label !== "string") return false;
  return isOptionalString(value.startedAt)
    && isOptionalString(value.completedAt)
    && isSerialCover(value.cover);
}

function isMetadata(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const yearLike = (entry: unknown) => entry === undefined || typeof entry === "string" || typeof entry === "number";
  return yearLike(value.year)
    && isOptionalString(value.season)
    && yearLike(value.seasonYear)
    && isStringArray(value.genres)
    && isStringArray(value.mediaTags)
    && isOptionalString(value.sourceMaterial)
    && isOptionalString(value.countryOfOrigin)
    && isStringArray(value.people)
    && isStringArray(value.platforms);
}

function isSource(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return isOptionalString(value.provider)
    && isOptionalString(value.id)
    && isOptionalString(value.anilistId)
    && isStringArray(value.urls);
}

function isCover(value: unknown): boolean {
  if (value === undefined) return true;
  return isRecord(value) && isOptionalString(value.path) && isOptionalString(value.remote);
}

function isDates(value: unknown): boolean {
  if (value === undefined) return true;
  return isRecord(value) && isOptionalString(value.startedAt) && isOptionalString(value.completedAt);
}

function isExportRecordV1(record: unknown): boolean {
  if (!isRecord(record) || !isRecord(record.progress)) return false;
  return typeof record.title === "string"
    && record.title.trim().length > 0
    && isOptionalString(record.originalTitle)
    && isOptionalString(record.romajiTitle)
    && (record.mediaType === "anime" || record.mediaType === "manga" || record.mediaType === "novel")
    && (record.status === "planned" || record.status === "ongoing" || record.status === "completed" || record.status === "dropped")
    && typeof record.format === "string"
    && record.format.trim().length > 0
    && typeof record.progress.unit === "string"
    && record.progress.unit.trim().length > 0
    && isProgressValue(record.progress.current)
    && (record.progress.total === undefined || isProgressValue(record.progress.total))
    && (record.score === undefined || (typeof record.score === "number" && Number.isFinite(record.score)))
    && typeof record.favorite === "boolean"
    && isReleaseStatus(record.releaseStatus)
    && isDates(record.dates)
    && (record.serialEntries === undefined
      || (Array.isArray(record.serialEntries) && record.serialEntries.every(isSerialEntry)))
    && isMetadata(record.metadata)
    && isSource(record.source)
    && isOptionalString(record.notePath)
    && isCover(record.cover);
}

export function isLibraryExportDocumentV1(value: unknown): value is LibraryExportDocumentV1 {
  if (!isRecord(value)
    || value.format !== ANIMELIST_LIBRARY_EXPORT_FORMAT
    || value.version !== ANIMELIST_LIBRARY_EXPORT_VERSION
    || typeof value.exportedAt !== "string"
    || !value.exportedAt.trim()
    || !Array.isArray(value.records)) return false;

  return value.records.every(isExportRecordV1);
}
