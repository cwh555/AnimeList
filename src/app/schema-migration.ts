import type { App, TFile } from "obsidian";
import {
  canonicalMediaStatus,
  shouldMigrateMediaStatus,
} from "../domain/media-status";
import type { MediaStatus } from "../domain/media-status";
import type { MediaType } from "../types";
import { getScopedMarkdownFiles } from "../data/vault-scope";

export const CURRENT_MEDIA_SCHEMA_VERSION = 6;
export const MEDIA_STATUS_MIGRATION_VERSION = 1;

export interface MediaStatusMigrationResult {
  total: number;
  ongoing: number;
  planned: number;
}

function isMediaType(value: unknown): value is MediaType {
  return value === "anime" || value === "manga" || value === "novel";
}

export function migrateMediaStatusFrontmatter(frontmatter: Record<string, unknown>): MediaStatus | null {
  if (!isMediaType(frontmatter.media_type) || !shouldMigrateMediaStatus(frontmatter.status)) return null;
  const status = canonicalMediaStatus(frontmatter.status);
  if (!status) return null;
  frontmatter.status = status;
  frontmatter.schema_version = CURRENT_MEDIA_SCHEMA_VERSION;
  return status;
}

function migrationCandidate(app: App, file: TFile): boolean {
  const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
  return Boolean(frontmatter
    && isMediaType(frontmatter.media_type)
    && shouldMigrateMediaStatus(frontmatter.status));
}

export async function migrateMediaStatusNotes(
  app: App,
  roots: string[],
  concurrency = 8,
): Promise<MediaStatusMigrationResult> {
  const files = getScopedMarkdownFiles(app, roots).filter((file) => migrationCandidate(app, file));
  const result: MediaStatusMigrationResult = { total: 0, ongoing: 0, planned: 0 };
  if (!files.length) return result;

  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < files.length) {
      const file = files[nextIndex];
      nextIndex += 1;
      let migrated: MediaStatus | null = null;
      await app.fileManager.processFrontMatter(file, (frontmatter) => {
        migrated = migrateMediaStatusFrontmatter(frontmatter);
      });
      if (!migrated) continue;
      result.total += 1;
      if (migrated === "ongoing") result.ongoing += 1;
      if (migrated === "planned") result.planned += 1;
    }
  };

  const workers = Math.min(files.length, Math.max(1, Math.floor(concurrency)));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return result;
}
