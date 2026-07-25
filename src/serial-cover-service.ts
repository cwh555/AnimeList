import { TFile } from "obsidian";
import type AnimeListPlugin from "./main";
import { getScopedMarkdownFiles } from "./vault-scope";
import {
  confidentSerialCover,
  selectOriginalTitle,
  serialCoverQuery,
  type RankedSerialCoverCandidate,
} from "./serial-entry-cover";
import {
  groupMissingSerialCoverRecords,
  missingSerialCoverEntryCount,
  type MissingSerialCoverRecord,
} from "./serial-cover-migration";
import { hasSerialCoverApiKey, searchSerialCovers } from "./serial-cover-provider";
import { serialCoverText } from "./serial-cover-text";
import type { ExternalMediaResult, MediaType } from "./types";

export interface StoredSerialCover {
  cover: string;
  provider: string;
  sourceId: string;
  manual: boolean;
}

export interface SerialCoverLookupContext {
  mediaType: "manga" | "novel";
  originalTitle: string;
}

export interface SerialCoverMigrationDetail {
  filePath: string;
  title: string;
  label: string;
  status: "loaded" | "not-found" | "failed" | "skipped";
  message: string;
}

export interface SerialCoverMigrationSummary {
  scanned: number;
  loaded: number;
  notFound: number;
  failed: number;
  skipped: number;
  details: SerialCoverMigrationDetail[];
}

export interface SerialCoverMigrationProgress {
  completed: number;
  total: number;
  phase: "scanning" | "resolving" | "loading" | "saving";
  message: string;
}

export type SerialCoverPlugin = AnimeListPlugin & {
  loadMissingSerialCovers?: (
    onProgress?: (progress: SerialCoverMigrationProgress) => void,
    signal?: AbortSignal,
  ) => Promise<SerialCoverMigrationSummary>;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readSerialCovers(value: unknown): Map<string, StoredSerialCover> {
  const output = new Map<string, StoredSerialCover>();
  for (const raw of list(value)) {
    const entry = record(raw);
    const label = text(entry?.label ?? entry?.volume).trim();
    const cover = text(entry?.cover).trim();
    if (!label || !cover) continue;
    output.set(label, {
      cover,
      provider: text(entry?.cover_provider ?? entry?.coverProvider),
      sourceId: text(entry?.cover_source_id ?? entry?.coverSourceId),
      manual: entry?.cover_manual === true || entry?.coverManual === true,
    });
  }
  return output;
}

export function mergeSerialCovers(
  frontmatter: Record<string, unknown>,
  covers: ReadonlyMap<string, StoredSerialCover>,
): void {
  if (!Array.isArray(frontmatter.volume_log)) return;
  frontmatter.volume_log = frontmatter.volume_log.map((raw: unknown): unknown => {
    const entry = record(raw);
    if (!entry) return raw;
    const cover = covers.get(text(entry.label ?? entry.volume).trim());
    if (cover) {
      return {
        ...entry,
        cover: cover.cover,
        cover_provider: cover.provider || undefined,
        cover_source_id: cover.sourceId || undefined,
        cover_manual: cover.manual || undefined,
      };
    }
    const next = { ...entry };
    for (const key of [
      "cover",
      "cover_provider",
      "coverProvider",
      "cover_source_id",
      "coverSourceId",
      "cover_manual",
      "coverManual",
    ]) delete next[key];
    return next;
  });
}

function asMediaResult(
  candidate: RankedSerialCoverCandidate,
  mediaType: MediaType,
): ExternalMediaResult {
  return {
    provider: candidate.provider,
    sourceId: candidate.sourceId,
    title: candidate.title,
    originalTitle: candidate.title,
    romajiTitle: "",
    mediaType,
    format: mediaType === "novel" ? "light_novel" : "manga",
    total: 0,
    unit: "volume",
    year: "",
    genres: [],
    rawGenres: [],
    people: [],
    platforms: [],
    sourceUrl: candidate.infoUrl,
    coverUrl: candidate.coverUrl,
    summary: "",
    externalScore: null,
    releaseStatus: "unknown",
  };
}

export async function findSerialCoverCandidates(
  context: SerialCoverLookupContext,
  label: string,
): Promise<RankedSerialCoverCandidate[]> {
  const query = serialCoverQuery(context.originalTitle, label);
  return query ? searchSerialCovers(query, context.originalTitle, label, context.mediaType) : [];
}

export async function downloadSelectedSerialCover(
  plugin: AnimeListPlugin,
  context: SerialCoverLookupContext,
  candidate: RankedSerialCoverCandidate,
  manual: boolean,
): Promise<StoredSerialCover> {
  const cover = await plugin.downloadCover(asMediaResult(candidate, context.mediaType));
  return {
    cover,
    provider: candidate.provider,
    sourceId: candidate.sourceId,
    manual,
  };
}

export async function loadConfidentSerialCover(
  plugin: AnimeListPlugin,
  context: SerialCoverLookupContext,
  label: string,
): Promise<StoredSerialCover | null> {
  const candidates = await findSerialCoverCandidates(context, label);
  const candidate = confidentSerialCover(candidates);
  return candidate ? downloadSelectedSerialCover(plugin, context, candidate, false) : null;
}

async function resolveOriginalTitle(
  plugin: AnimeListPlugin,
  mediaType: "manga" | "novel",
  frontmatter: Record<string, unknown>,
): Promise<string | null> {
  const stored = selectOriginalTitle(frontmatter.title_original, frontmatter.title_aliases);
  if (stored) return stored;
  const title = text(frontmatter.title).trim();
  if (!title) return null;
  const results = await plugin.searchAniList(mediaType, title);
  return results
    .map((result) => selectOriginalTitle(result.originalTitle, result.searchTitles))
    .find((value): value is string => Boolean(value)) ?? null;
}

function summary(total: number, details: SerialCoverMigrationDetail[]): SerialCoverMigrationSummary {
  return {
    scanned: total,
    loaded: details.filter((detail) => detail.status === "loaded").length,
    notFound: details.filter((detail) => detail.status === "not-found").length,
    failed: details.filter((detail) => detail.status === "failed").length,
    skipped: details.filter((detail) => detail.status === "skipped").length
      + Math.max(0, total - details.length),
    details,
  };
}

export async function loadMissingSerialCovers(
  plugin: AnimeListPlugin,
  onProgress?: (progress: SerialCoverMigrationProgress) => void,
  signal?: AbortSignal,
): Promise<SerialCoverMigrationSummary> {
  if (!hasSerialCoverApiKey()) throw new Error(serialCoverText("settings.apiKeyRequired"));
  const records: MissingSerialCoverRecord[] = [];
  const files = new Map<string, TFile>();
  const details: SerialCoverMigrationDetail[] = [];
  onProgress?.({ completed: 0, total: 0, phase: "scanning", message: "Scanning notes" });

  for (const file of getScopedMarkdownFiles(plugin.app, plugin.getScanFolders())) {
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    const mediaType = frontmatter?.media_type === "manga"
      ? "manga"
      : frontmatter?.media_type === "novel" ? "novel" : null;
    if (!mediaType || !Array.isArray(frontmatter?.volume_log)) continue;
    files.set(file.path, file);
    const title = text(frontmatter.title) || file.basename;
    for (const raw of frontmatter.volume_log) {
      const entry = record(raw);
      const label = text(entry?.label ?? entry?.volume).trim();
      if (entry && label && !entry.cover) records.push({ filePath: file.path, title, mediaType, label });
    }
  }

  const works = groupMissingSerialCoverRecords(records);
  const total = missingSerialCoverEntryCount(works);
  let completed = 0;

  for (const work of works) {
    if (signal?.aborted) break;
    const file = files.get(work.filePath);
    if (!file) continue;
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    onProgress?.({
      completed,
      total,
      phase: "resolving",
      message: `Resolving original title · ${work.title}`,
    });

    let original: string | null;
    try {
      original = await resolveOriginalTitle(plugin, work.mediaType, frontmatter);
      if (original && !text(frontmatter.title_original)) {
        await plugin.app.fileManager.processFrontMatter(file, (next) => {
          next.title_original = original;
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const label of work.labels) {
        details.push({ filePath: file.path, title: work.title, label, status: "failed", message });
        completed += 1;
      }
      continue;
    }

    if (!original) {
      for (const label of work.labels) {
        details.push({
          filePath: file.path,
          title: work.title,
          label,
          status: "skipped",
          message: "Original title unavailable",
        });
        completed += 1;
      }
      continue;
    }

    const context = { mediaType: work.mediaType, originalTitle: original };
    for (const label of work.labels) {
      if (signal?.aborted) break;
      onProgress?.({
        completed,
        total,
        phase: "loading",
        message: `Loading cover · ${work.title} · ${label}`,
      });
      try {
        const cover = await loadConfidentSerialCover(plugin, context, label);
        if (!cover) {
          details.push({
            filePath: file.path,
            title: work.title,
            label,
            status: "not-found",
            message: serialCoverText("notFound"),
          });
        } else {
          onProgress?.({
            completed,
            total,
            phase: "saving",
            message: `Saving cover · ${work.title} · ${label}`,
          });
          await plugin.app.fileManager.processFrontMatter(file, (next) => {
            if (!Array.isArray(next.volume_log)) return;
            next.volume_log = next.volume_log.map((raw: unknown): unknown => {
              const entry = record(raw);
              if (!entry || text(entry.label ?? entry.volume).trim() !== label || entry.cover) return raw;
              return {
                ...entry,
                cover: cover.cover,
                cover_provider: cover.provider,
                cover_source_id: cover.sourceId,
              };
            });
          });
          details.push({
            filePath: file.path,
            title: work.title,
            label,
            status: "loaded",
            message: cover.provider,
          });
        }
      } catch (error) {
        details.push({
          filePath: file.path,
          title: work.title,
          label,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      completed += 1;
      onProgress?.({ completed, total, phase: "loading", message: `${completed} / ${total}` });
    }
  }

  return summary(total, details);
}
