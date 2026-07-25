import { type Plugin } from "obsidian";
import {
  fetchAniListClassifications,
  mergeAniListClassifications,
  type AniListClassification,
} from "./anilist-classification";
import { classificationValues, rebuildClassificationFrontmatter } from "./classification-compatibility";
import { resolveClassifiedMediaResult } from "./classification-resolution";
import type { ExternalMediaResult, MediaType, ReleaseStatus } from "./types";
import { getScopedMarkdownFiles } from "./vault-scope";

const USER_AGENT = "AnimeList-Obsidian/1.1.2 (local personal media library)";
const MIGRATION_MARKER = Symbol.for("animelist.media-classification-migration");

export interface ClassificationMigrationEntry {
  path: string;
  title: string;
}

export interface ClassificationMigrationProgress {
  processed: number;
  total: number;
  title: string;
}

export interface ClassificationMigrationSummary {
  scanned: number;
  changed: number;
  resolved: number;
  unresolved: number;
  removed: number;
  moved: number;
  changedEntries: ClassificationMigrationEntry[];
  unchangedEntries: ClassificationMigrationEntry[];
  unresolvedEntries: ClassificationMigrationEntry[];
}

export type ClassificationMigrationProgressHandler = (progress: ClassificationMigrationProgress) => void;

export interface ClassificationMigrationHost extends Plugin {
  getScanFolders(): string[];
  refreshViews(): void;
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  migrateMediaClassification?: (
    onProgress?: ClassificationMigrationProgressHandler,
  ) => Promise<ClassificationMigrationSummary>;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
function stringArray(value: unknown): string[] {
  return (Array.isArray(value) ? value : value == null ? [] : [value]).map(stringValue).filter(Boolean);
}
function mediaTypeValue(value: unknown): MediaType | null {
  return value === "anime" || value === "manga" || value === "novel" ? value : null;
}
function releaseStatusValue(value: unknown): ReleaseStatus {
  return value === "releasing" || value === "finished" || value === "hiatus" || value === "cancelled" ? value : "unknown";
}

async function readCurrentFrontmatter(
  plugin: ClassificationMigrationHost,
  file: ReturnType<typeof getScopedMarkdownFiles>[number],
): Promise<Record<string, unknown>> {
  let snapshot: Record<string, unknown> = {};
  await plugin.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
    snapshot = structuredClone(frontmatter);
  });
  return snapshot;
}

export function migrationLookupResult(frontmatter: Record<string, unknown>, basename: string): ExternalMediaResult | null {
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
    season: Number(frontmatter.season ?? 0) === 1 || Number(frontmatter.season ?? 0) === 4
      || Number(frontmatter.season ?? 0) === 7 || Number(frontmatter.season ?? 0) === 10
      ? Number(frontmatter.season) as 1 | 4 | 7 | 10 : "",
    genres: [],
    tags: [],
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

export function applyCanonicalMigrationMetadata(
  frontmatter: Record<string, unknown>,
  canonical: ExternalMediaResult,
  fileBasename = "",
): ReturnType<typeof rebuildClassificationFrontmatter> {
  const legacyTags = classificationValues(frontmatter.tags);
  if (legacyTags.length && frontmatter.classification_legacy_tags == null) {
    frontmatter.classification_legacy_tags = [...legacyTags];
  }
  const result = rebuildClassificationFrontmatter(
    frontmatter,
    { genres: canonical.genres, tags: [] },
    canonical.sourceId,
    fileBasename,
  );
  delete frontmatter.tags;
  if (canonical.year !== "" && canonical.year != null) frontmatter.year = canonical.year;
  if (canonical.season !== "" && canonical.season != null) frontmatter.season = canonical.season;
  else delete frontmatter.season;
  return result;
}

function emptySummary(): ClassificationMigrationSummary {
  return {
    scanned: 0,
    changed: 0,
    resolved: 0,
    unresolved: 0,
    removed: 0,
    moved: 0,
    changedEntries: [],
    unchangedEntries: [],
    unresolvedEntries: [],
  };
}

function changedByMigration(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  const tracked = [
    "genres", "media_tags", "tags", "classification_version", "classification_source_provider",
    "classification_source_id", "classification_legacy_genres", "classification_legacy_media_tags",
    "classification_legacy_tags", "year", "season",
  ];
  return tracked.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

export async function migrateMediaClassification(
  plugin: ClassificationMigrationHost,
  onProgress: ClassificationMigrationProgressHandler = () => {},
): Promise<ClassificationMigrationSummary> {
  const summary = emptySummary();
  const pending: Array<{
    file: ReturnType<typeof getScopedMarkdownFiles>[number];
    lookup: ExternalMediaResult;
  }> = [];

  for (const file of getScopedMarkdownFiles(plugin.app, plugin.getScanFolders())) {
    const frontmatter = await readCurrentFrontmatter(plugin, file);
    if (!frontmatter.media_type) continue;
    summary.scanned += 1;
    const lookup = migrationLookupResult(frontmatter, file.basename);
    if (lookup) pending.push({ file, lookup });
    else {
      summary.unresolved += 1;
      summary.unresolvedEntries.push({ path: file.path, title: stringValue(frontmatter.title) || file.basename });
    }
  }

  const direct = pending.filter(({ lookup }) => lookup.provider.toLocaleLowerCase() === "anilist" && /^\d+$/.test(lookup.sourceId));
  let directMap = new Map<string, AniListClassification>();
  try {
    directMap = await fetchAniListClassifications(direct.map(({ lookup }) => lookup), USER_AGENT);
  } catch (error) {
    console.warn("AnimeList direct classification batch lookup failed", error);
  }

  const canonicalByPath = new Map<string, ExternalMediaResult>();
  for (const entry of direct) {
    const [canonical] = mergeAniListClassifications([entry.lookup], directMap);
    if (canonical?.genres.length) canonicalByPath.set(entry.file.path, canonical);
  }

  let processed = 0;
  for (const entry of pending) {
    let canonical = canonicalByPath.get(entry.file.path);
    if (!canonical) {
      try {
        const resolved = await resolveClassifiedMediaResult(plugin, entry.lookup);
        if (resolved.provider.toLocaleLowerCase() === "anilist" && resolved.genres.length) canonical = resolved;
      } catch (error) {
        console.warn(`AnimeList classification cleanup failed to resolve ${entry.file.path}`, error);
      }
    }

    const item = { path: entry.file.path, title: entry.lookup.title || entry.file.basename };
    if (!canonical) {
      summary.unresolved += 1;
      summary.unresolvedEntries.push(item);
    } else {
      summary.resolved += 1;
      let didChange = false;
      await plugin.app.fileManager.processFrontMatter(entry.file, (frontmatter: Record<string, unknown>) => {
        const before = structuredClone(frontmatter);
        const result = applyCanonicalMigrationMetadata(frontmatter, canonical, entry.file.basename);
        didChange = changedByMigration(before, frontmatter);
        summary.removed += result.removed.length + classificationValues(before.tags).length;
        summary.moved += result.moved.length;
      });
      if (didChange) {
        summary.changed += 1;
        summary.changedEntries.push(item);
      } else {
        summary.unchangedEntries.push(item);
      }
    }

    processed += 1;
    onProgress({ processed, total: pending.length, title: item.title });
  }

  if (summary.changed) plugin.refreshViews();
  return summary;
}

export function installClassificationMigration(plugin: Plugin): void {
  const runtime = plugin as ClassificationMigrationHost;
  if (Reflect.get(runtime, MIGRATION_MARKER) === true) return;
  runtime.migrateMediaClassification = (onProgress) => migrateMediaClassification(runtime, onProgress);
  Object.defineProperty(runtime, MIGRATION_MARKER, { value: true });
}
