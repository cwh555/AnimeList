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

export const LIBRARY_TEXT_EXPORT_FIELDS = [
  "entry",
  "mediaType",
  "originalTitle",
  "score",
  "progress",
  "startedAt",
  "status",
  "favorite",
  "genres",
] as const;

export type LibraryTextExportField = (typeof LIBRARY_TEXT_EXPORT_FIELDS)[number];

export const DEFAULT_LIBRARY_TEXT_EXPORT_FIELDS: readonly LibraryTextExportField[] = [
  "entry",
  "mediaType",
];

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

export function isLibraryExportDocumentV1(value: unknown): value is LibraryExportDocumentV1 {
  if (!isRecord(value)
    || value.format !== ANIMELIST_LIBRARY_EXPORT_FORMAT
    || value.version !== ANIMELIST_LIBRARY_EXPORT_VERSION
    || typeof value.exportedAt !== "string"
    || !Array.isArray(value.records)) return false;

  return value.records.every((record) => {
    if (!isRecord(record) || !isRecord(record.progress)) return false;
    return typeof record.title === "string"
      && (record.mediaType === "anime" || record.mediaType === "manga" || record.mediaType === "novel")
      && (record.status === "planned" || record.status === "ongoing" || record.status === "completed" || record.status === "dropped")
      && typeof record.format === "string"
      && typeof record.progress.unit === "string"
      && (typeof record.progress.current === "string" || typeof record.progress.current === "number")
      && typeof record.favorite === "boolean";
  });
}
