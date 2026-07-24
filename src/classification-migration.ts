import { type Plugin } from "obsidian";
import {
  classificationValues,
  rebuildClassificationFrontmatter,
} from "./classification-compatibility";
import { resolveClassifiedMediaResult } from "./classification-resolution";
import type { ExternalMediaResult, MediaType, ReleaseStatus } from "./types";
import { getScopedMarkdownFiles } from "./vault-scope";

const MIGRATION_MARKER = Symbol.for("animelist.media-classification-migration");

export interface ClassificationMigrationSummary {
  scanned: number;
  changed: number;
  resolved: number;
  unresolved: number;
  removed: number;
  moved: number;
}

export interface ClassificationMigrationHost extends Plugin {
  getScanFolders(): string[];
  refreshViews(): void;
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  migrateMediaClassification?: () => Promise<ClassificationMigrationSummary>;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function stringArray(value: unknown): string[] {
  const source = Array.isArray(value) ? value : value == null ? [] : [value];
  return source.map(stringValue).filter(Boolean);
}

function mediaTypeValue(value: unknown): MediaType | null {
  return value === "anime" || value === "manga" || value === "novel" ? value : null;
}

function releaseStatusValue(value: unknown): ReleaseStatus {
  return value === "releasing" || value === "finished" || value === "hiatus" || value === "cancelled"
    ? value
    : "unknown";
}

export function migrationLookupResult(
  frontmatter: Record<string, unknown>,
  basename: string,
): ExternalMediaResult | null {
  const mediaType = mediaTypeValue(frontmatter.media_type);
  if (!mediaType) return null;
  const title = stringValue(frontmatter.title) || basename;
  return {
    provider: stringValue(frontmatter.source_provider) || "legacy",
    sourceId: stringValue(frontmatter.source_id),
    title,
    originalTitle: stringValue(frontmatter.title_original),
    romajiTitle: stringValue(frontmatter.title_romaji),
    mediaType,
    format: stringValue(frontmatter.format) || mediaType,
    total: Number(frontmatter.progress_total ?? 0) || 0,
    unit: stringValue(frontmatter.progress_unit),
    year: Number(frontmatter.year ?? 0) || "",
    genres: classificationValues(frontmatter.genres),
    tags: classificationValues(frontmatter.media_tags),
    rawGenres: stringArray(frontmatter.source_genres),
    rawTags: [],
    people: stringArray(frontmatter.studios ?? frontmatter.authors ?? frontmatter.creators ?? frontmatter.people),
    platforms: stringArray(frontmatter.platforms),
    sourceUrl: stringArray(frontmatter.source_urls)[0] ?? "",
    coverUrl: stringValue(frontmatter.cover_remote ?? frontmatter.cover),
    summary: "",
    externalScore: Number.isFinite(Number(frontmatter.source_score)) ? Number(frontmatter.source_score) : null,
    releaseStatus: releaseStatusValue(frontmatter.release_status),
    searchTitles: [title, stringValue(frontmatter.title_original), stringValue(frontmatter.title_romaji)].filter(Boolean),
  };
}

export async function migrateMediaClassification(
  plugin: ClassificationMigrationHost,
): Promise<ClassificationMigrationSummary> {
  const summary: ClassificationMigrationSummary = {
    scanned: 0,
    changed: 0,
    resolved: 0,
    unresolved: 0,
    removed: 0,
    moved: 0,
  };
  const files = getScopedMarkdownFiles(plugin.app, plugin.getScanFolders());
  for (const file of files) {
    const cached = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!cached?.media_type) continue;
    summary.scanned += 1;
    const lookup = migrationLookupResult(cached, file.basename);
    if (!lookup) {
      summary.unresolved += 1;
      continue;
    }
    const canonical = await resolveClassifiedMediaResult(plugin, lookup);
    if (canonical.provider.toLocaleLowerCase() !== "anilist" || !canonical.genres.length) {
      summary.unresolved += 1;
      continue;
    }
    summary.resolved += 1;
    await plugin.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
      const beforeGenres = classificationValues(frontmatter.genres);
      const beforeTags = classificationValues(frontmatter.media_tags);
      const beforeVersion = Number(frontmatter.classification_version ?? 0);
      const result = rebuildClassificationFrontmatter(
        frontmatter,
        { genres: canonical.genres, tags: [] },
        canonical.sourceId,
        file.basename,
      );
      const afterGenres = classificationValues(frontmatter.genres);
      const afterTags = classificationValues(frontmatter.media_tags);
      const changed = JSON.stringify(beforeGenres) !== JSON.stringify(afterGenres)
        || JSON.stringify(beforeTags) !== JSON.stringify(afterTags)
        || beforeVersion < 4;
      if (changed) summary.changed += 1;
      summary.removed += result.removed.length;
      summary.moved += result.moved.length;
    });
  }
  if (summary.changed) plugin.refreshViews();
  return summary;
}

export function installClassificationMigration(plugin: Plugin): void {
  const runtime = plugin as ClassificationMigrationHost;
  if (Reflect.get(runtime, MIGRATION_MARKER) === true) return;
  runtime.migrateMediaClassification = () => migrateMediaClassification(runtime);
  Object.defineProperty(runtime, MIGRATION_MARKER, { value: true });
}
