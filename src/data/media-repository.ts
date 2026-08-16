import { App, TFile } from "obsidian";
import type { CoverSources, MediaItem } from "../domain/media-types";
import { compatibleGenres, compatibleSeasonMetadata, compatibleStudios } from "./media-frontmatter-compat";
import {
  formatFileModifiedTime,
  mediaTypeOf,
  normalizedCoverPath,
  optionalScore,
  stringArray,
  stringValue,
} from "../domain/value-normalization";
import { normalizeMediaStatus } from "../domain/media-status";
import {
  normalizeProgressValue,
  normalizeReleaseStatus,
} from "../domain/progress/novel-progress";
import { defaultProgressUnit, isReadingProgressUnit, normalizeSerialLog } from "../domain/progress-units";
import { uiText } from "../ui-text";
import { getScopedMarkdownFiles } from "./vault-scope";

export type CoverSourcesResolver = (file: TFile) => CoverSources | undefined;

function frontmatterRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export class MediaRepository {
  constructor(
    private readonly app: App,
    private readonly coverSourcesFor?: CoverSourcesResolver,
  ) {}

  resolveCoverFile(value: unknown, sourcePath: string): TFile | null {
    const coverPath = normalizedCoverPath(value);
    if (!coverPath || /^https?:\/\//i.test(coverPath)) return null;
    const coverFile = this.app.metadataCache.getFirstLinkpathDest(coverPath, sourcePath)
      ?? this.app.vault.getAbstractFileByPath(coverPath);
    return coverFile instanceof TFile ? coverFile : null;
  }

  resolveCoverPath(value: unknown, sourcePath: string): string {
    const coverPath = normalizedCoverPath(value);
    if (/^https?:\/\//i.test(coverPath)) return coverPath;
    const coverFile = this.resolveCoverFile(value, sourcePath);
    return coverFile ? this.app.vault.getResourcePath(coverFile) : "";
  }

  read(file: TFile): MediaItem | null {
    const frontmatter = frontmatterRecord(
      this.app.metadataCache.getFileCache(file)?.frontmatter,
    );
    if (!frontmatter) return null;
    const mediaType = mediaTypeOf(frontmatter.media_type);
    if (!mediaType) return null;

    const coverPath = normalizedCoverPath(frontmatter.cover);
    const remoteCoverPath = normalizedCoverPath(frontmatter.cover_remote);
    const coverFile = this.resolveCoverFile(frontmatter.cover, file.path);
    const studios = compatibleStudios(frontmatter);
    const authors = stringArray(frontmatter.authors);
    const people = mediaType === "anime"
      ? studios
      : authors.length
        ? authors
        : stringArray(frontmatter.creators);
    const modified = Number(file.stat?.mtime || 0);
    const modifiedLabel = modified ? formatFileModifiedTime(modified) : "";
    const progressUnit = defaultProgressUnit(mediaType, frontmatter.progress_unit);
    return {
      title: stringValue(frontmatter.title, file.basename),
      originalTitle: stringValue(
        frontmatter.title_original,
        stringValue(frontmatter.title_romaji),
      ),
      mediaType,
      format: stringValue(frontmatter.format, mediaType),
      status: normalizeMediaStatus(frontmatter.status),
      releaseStatus: normalizeReleaseStatus(frontmatter.release_status),
      progress: normalizeProgressValue(frontmatter.progress),
      total: mediaType === "anime"
        ? normalizeProgressValue(frontmatter.progress_total)
        : 0,
      unit: stringValue(frontmatter.progress_unit),
      score: optionalScore(frontmatter.score),
      favorite: frontmatter.favorite === true,
      year: typeof frontmatter.year === "number" || typeof frontmatter.year === "string"
        ? frontmatter.year
        : "",
      genres: compatibleGenres(frontmatter),
      mediaTags: stringArray(frontmatter.media_tags),
      userTags: stringArray(frontmatter.user_tags),
      season: compatibleSeasonMetadata(frontmatter).season ?? "",
      seasonYear: compatibleSeasonMetadata(frontmatter).seasonYear ?? "",
      sourceMaterial: stringValue(frontmatter.source_material),
      countryOfOrigin: stringValue(frontmatter.country_of_origin),
      anilistId: stringValue(frontmatter.anilist_id),
      people,
      platforms: stringArray(frontmatter.platforms),
      sourceUrls: stringArray(frontmatter.source_urls),
      cover: coverFile
        ? this.app.vault.getResourcePath(coverFile)
        : /^https?:\/\//i.test(coverPath)
          ? coverPath
          : /^https?:\/\//i.test(remoteCoverPath)
            ? remoteCoverPath
            : "",
      coverSources: coverFile ? this.coverSourcesFor?.(coverFile) : undefined,
      filePath: file.path,
      updated: modified,
      updatedLabel: modifiedLabel
        ? uiText("library.updatedAt", { date: modifiedLabel })
        : "",
      startedAt: stringValue(frontmatter.started_at),
      completedAt: stringValue(frontmatter.completed_at),
      volumeLog: mediaType !== "anime" && isReadingProgressUnit(progressUnit)
        ? normalizeSerialLog(frontmatter.volume_log, progressUnit)
        : [],
    };
  }

  collect(roots: string[]): MediaItem[] {
    return getScopedMarkdownFiles(this.app, roots)
      .map((file) => this.read(file))
      .filter((item): item is MediaItem => item !== null);
  }

  findBySource(roots: string[], provider: string, sourceId: string): TFile | undefined {
    return getScopedMarkdownFiles(this.app, roots).find((file) => {
      const frontmatter = frontmatterRecord(
        this.app.metadataCache.getFileCache(file)?.frontmatter,
      );
      return frontmatter !== null
        && stringValue(frontmatter.source_provider) === provider
        && stringValue(frontmatter.source_id) === sourceId;
    });
  }
}
