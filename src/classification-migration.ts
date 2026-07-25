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
  reason?: string;
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

type MigrationWork = {
  file: ReturnType<typeof getScopedMarkdownFiles>[number];
  item: ClassificationMigrationEntry;
  lookup: ExternalMediaResult | null;
};

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
function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : stringValue(value) || "Unknown error";
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
    genres: [], tags: [], rawGenres: stringArray(frontmatter.source_genres), rawTags: [],
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
  frontmatter: Record<string, unknown>, canonical: ExternalMediaResult, fileBasename = "",
): ReturnType<typeof rebuildClassificationFrontmatter> {
  const legacyTags = classificationValues(frontmatter.tags);
  if (legacyTags.length && frontmatter.classification_legacy_tags == null) frontmatter.classification_legacy_tags = [...legacyTags];
  const result = rebuildClassificationFrontmatter(frontmatter, { genres: canonical.genres, tags: [] }, canonical.sourceId, fileBasename);
  delete frontmatter.tags;
  if (canonical.year !== "" && canonical.year != null) frontmatter.year = canonical.year;
  if (canonical.season !== "" && canonical.season != null) frontmatter.season = canonical.season;
  else delete frontmatter.season;
  return result;
}

function emptySummary(): ClassificationMigrationSummary {
  return { scanned: 0, changed: 0, resolved: 0, unresolved: 0, removed: 0, moved: 0, changedEntries: [], unchangedEntries: [], unresolvedEntries: [] };
}

function changedByMigration(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  const tracked = ["genres", "media_tags", "tags", "classification_version", "classification_source_provider", "classification_source_id", "classification_legacy_genres", "classification_legacy_media_tags", "classification_legacy_tags", "year", "season"];
  return tracked.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function healthProbe(): ExternalMediaResult {
  return { provider: "anilist", sourceId: "1", title: "Cowboy Bebop", originalTitle: "カウボーイビバップ", romajiTitle: "Cowboy Bebop", mediaType: "anime", format: "tv", total: 26, unit: "episode", year: 1998, season: 4, genres: [], tags: [], rawGenres: [], rawTags: [], people: [], platforms: [], sourceUrl: "https://anilist.co/anime/1", coverUrl: "", summary: "", externalScore: null, releaseStatus: "finished" };
}

async function assertAniListAvailable(): Promise<void> {
  const result = await fetchAniListClassifications([healthProbe()], USER_AGENT);
  if (!result.get("1")?.genres.length) throw new Error("AniList health check returned no classifications for media ID 1.");
}

export async function migrateMediaClassification(
  plugin: ClassificationMigrationHost,
  onProgress: ClassificationMigrationProgressHandler = () => {},
): Promise<ClassificationMigrationSummary> {
  const summary = emptySummary();
  const work: MigrationWork[] = [];
  for (const file of getScopedMarkdownFiles(plugin.app, plugin.getScanFolders())) {
    const frontmatter = await readCurrentFrontmatter(plugin, file);
    if (!frontmatter.media_type || frontmatter.animelist_test_fixture === true) continue;
    const item = { path: file.path, title: stringValue(frontmatter.title) || file.basename };
    work.push({ file, item, lookup: migrationLookupResult(frontmatter, file.basename) });
  }
  summary.scanned = work.length;
  if (!work.length) return summary;
  await assertAniListAvailable();

  const direct = work.filter((entry): entry is MigrationWork & { lookup: ExternalMediaResult } => entry.lookup !== null && entry.lookup.provider.toLocaleLowerCase() === "anilist" && /^\d+$/.test(entry.lookup.sourceId));
  let directMap = new Map<string, AniListClassification>();
  try {
    directMap = await fetchAniListClassifications(direct.map(({ lookup }) => lookup), USER_AGENT);
  } catch (error) {
    throw new Error(`AniList direct classification lookup failed: ${errorMessage(error)}`);
  }

  const canonicalByPath = new Map<string, ExternalMediaResult>();
  for (const entry of direct) {
    const [canonical] = mergeAniListClassifications([entry.lookup], directMap);
    if (canonical?.genres.length) canonicalByPath.set(entry.file.path, canonical);
  }

  let processed = 0;
  for (const entry of work) {
    let canonical = canonicalByPath.get(entry.file.path);
    let reason = "No reliable AniList match was found.";
    if (entry.lookup && !canonical) {
      try {
        const resolved = await resolveClassifiedMediaResult(plugin, entry.lookup);
        if (resolved.provider.toLocaleLowerCase() !== "anilist") reason = "No reliable AniList work matched the saved title and metadata.";
        else if (!resolved.genres.length) reason = `AniList ID ${resolved.sourceId || "unknown"} returned no supported classifications.`;
        else canonical = resolved;
      } catch (error) {
        reason = `AniList lookup failed: ${errorMessage(error)}`;
      }
    }

    if (!entry.lookup || !canonical) {
      summary.unresolved += 1;
      summary.unresolvedEntries.push({ ...entry.item, reason: entry.lookup ? reason : "The note has an unsupported or missing media_type." });
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
      if (didChange) { summary.changed += 1; summary.changedEntries.push(entry.item); }
      else summary.unchangedEntries.push(entry.item);
    }
    processed += 1;
    onProgress({ processed, total: work.length, title: entry.item.title });
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
