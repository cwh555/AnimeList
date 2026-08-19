import { TFile, normalizePath } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import {
  ANIMELIST_LIBRARY_EXPORT_FORMAT,
  ANIMELIST_LIBRARY_EXPORT_VERSION,
  serializeLibraryExportDocument,
  sortLibraryExportRecords,
  type LibraryExportDocumentV1,
  type LibraryExportFormat,
  type LibraryExportMetadataV1,
  type LibraryExportRecordV1,
  type LibraryExportSerialEntryV1,
  type LibraryExportSourceV1,
} from "../domain/library-export";
import type { MediaItem } from "../domain/media-types";
import {
  defaultProgressUnit,
  isReadingProgressUnit,
  normalizeSerialLog,
} from "../domain/progress-units";
import {
  normalizedCoverPath,
  stringValue,
} from "../domain/value-normalization";

function frontmatterRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nonEmptyArray<T>(values: readonly T[] | undefined): T[] | undefined {
  return values?.length ? [...values] : undefined;
}

function hasValues(value: object): boolean {
  return Object.values(value).some((entry) => {
    if (Array.isArray(entry)) return entry.length > 0;
    if (typeof entry === "boolean") return entry;
    return entry !== undefined && entry !== null && entry !== "";
  });
}

function serialEntriesFor(item: MediaItem): LibraryExportSerialEntryV1[] | undefined {
  const unit = defaultProgressUnit(item.mediaType, item.unit);
  if (item.mediaType === "anime" || !isReadingProgressUnit(unit)) return undefined;
  const entries = normalizeSerialLog(item.volumeLog, unit).map((entry): LibraryExportSerialEntryV1 => {
    const cover = {
      path: entry.cover || undefined,
      provider: entry.coverProvider || undefined,
      sourceId: entry.coverSourceId || undefined,
      manual: entry.coverManual || undefined,
    };
    return {
      label: entry.label,
      startedAt: entry.startedAt || undefined,
      completedAt: entry.completedAt || undefined,
      ...(hasValues(cover) ? { cover } : {}),
    };
  });
  return entries.length ? entries : undefined;
}

export function libraryExportRecordFromItem(
  item: MediaItem,
  frontmatterValue: unknown = {},
): LibraryExportRecordV1 {
  const frontmatter = frontmatterRecord(frontmatterValue);
  const progressUnit = defaultProgressUnit(item.mediaType, item.unit);
  const dates = {
    startedAt: item.startedAt || undefined,
    completedAt: item.completedAt || undefined,
  };
  const metadata: LibraryExportMetadataV1 = {
    year: item.year === "" ? undefined : item.year,
    season: item.season || undefined,
    seasonYear: item.seasonYear === "" ? undefined : item.seasonYear,
    genres: nonEmptyArray(item.genres),
    mediaTags: nonEmptyArray(item.mediaTags),
    sourceMaterial: item.sourceMaterial || undefined,
    countryOfOrigin: item.countryOfOrigin || undefined,
    people: nonEmptyArray(item.people),
    platforms: nonEmptyArray(item.platforms),
  };
  const provider = stringValue(frontmatter.source_provider).trim().toLocaleLowerCase();
  const sourceId = stringValue(frontmatter.source_id).trim();
  const source: LibraryExportSourceV1 = {
    provider: provider || undefined,
    id: sourceId || undefined,
    anilistId: (item.anilistId || stringValue(frontmatter.anilist_id)).trim() || undefined,
    urls: nonEmptyArray(item.sourceUrls),
  };
  const cover = {
    path: normalizedCoverPath(frontmatter.cover) || undefined,
    remote: normalizedCoverPath(frontmatter.cover_remote) || undefined,
  };
  const rawOriginalTitle = stringValue(frontmatter.title_original).trim();
  const romajiTitle = stringValue(frontmatter.title_romaji).trim();
  const originalTitle = rawOriginalTitle || (!Object.keys(frontmatter).length ? item.originalTitle : "");

  const serialEntries = serialEntriesFor(item);

  return {
    title: item.title,
    originalTitle: originalTitle || undefined,
    romajiTitle: romajiTitle || undefined,
    mediaType: item.mediaType,
    format: item.format || item.mediaType,
    status: item.status,
    ...(item.mediaType === "anime" ? {} : { releaseStatus: item.releaseStatus }),
    progress: {
      current: item.progress,
      ...(item.mediaType === "anime" ? { total: item.total } : {}),
      unit: progressUnit,
    },
    ...(item.score == null ? {} : { score: item.score }),
    favorite: item.favorite,
    ...(hasValues(dates) ? { dates } : {}),
    ...(serialEntries ? { serialEntries } : {}),
    ...(hasValues(metadata) ? { metadata } : {}),
    ...(hasValues(source) ? { source } : {}),
    notePath: item.filePath || undefined,
    ...(hasValues(cover) ? { cover } : {}),
  };
}

function dateStamp(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value, index) => index === 0 ? String(value) : String(value).padStart(2, "0"))
    .join("-");
}

export class LibraryExportService {
  constructor(private readonly host: AnimeListFeatureHost) {}

  createDocument(items: readonly MediaItem[], exportedAt = new Date().toISOString()): LibraryExportDocumentV1 {
    const records = items.map((item) => {
      const file = this.host.app.vault.getAbstractFileByPath(item.filePath);
      const frontmatter = file instanceof TFile
        ? this.host.app.metadataCache.getFileCache(file)?.frontmatter
        : undefined;
      return libraryExportRecordFromItem(item, frontmatter);
    });
    return {
      format: ANIMELIST_LIBRARY_EXPORT_FORMAT,
      version: ANIMELIST_LIBRARY_EXPORT_VERSION,
      exportedAt,
      records: sortLibraryExportRecords(records),
    };
  }

  createJson(items: readonly MediaItem[], exportedAt = new Date().toISOString()): string {
    return serializeLibraryExportDocument(this.createDocument(items, exportedAt));
  }

  async saveToVault(content: string, format: LibraryExportFormat, date = new Date()): Promise<string> {
    const root = this.host.settings.libraryRoot.trim() || "AnimeList";
    const folder = normalizePath(`${root}/Exports`);
    await this.host.ensureFolder(folder);
    const extension = format === "json" ? "animelist.json" : "txt";
    const path = await this.host.uniqueFilePath(folder, `AnimeList-${dateStamp(date)}`, extension);
    await this.host.app.vault.create(path, content);
    return path;
  }
}
