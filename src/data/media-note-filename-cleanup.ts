import { TFile, type App } from "obsidian";
import type { MediaType } from "../domain/media-types";
import { mediaNoteFolder } from "../domain/media-note-filename";
import { getScopedMarkdownFiles } from "./vault-scope";
import { uniqueVaultFilePath } from "./vault-file-path";

export interface MediaNoteFilenameCleanupItem {
  path: string;
  title: string;
  targetPath: string;
}

export interface MediaNoteFilenameCleanupPlan {
  scanned: number;
  items: MediaNoteFilenameCleanupItem[];
}

export interface MediaNoteFilenameCleanupDetail {
  path: string;
  targetPath: string;
  title: string;
  status: "renamed" | "skipped" | "failed";
  message: string;
}

export interface MediaNoteFilenameCleanupResult {
  renamed: number;
  skipped: number;
  failed: number;
  details: MediaNoteFilenameCleanupDetail[];
}

function mediaType(value: unknown): MediaType | null {
  return value === "anime" || value === "manga" || value === "novel" ? value : null;
}

function noteIdentity(app: App, file: TFile): { title: string; mediaType: MediaType } | null {
  const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
  const title = typeof frontmatter?.title === "string" ? frontmatter.title.trim() : "";
  const type = mediaType(frontmatter?.media_type);
  return title && type ? { title, mediaType: type } : null;
}

export function planMediaNoteFilenameCleanup(
  app: App,
  roots: string[],
): MediaNoteFilenameCleanupPlan {
  const files = getScopedMarkdownFiles(app, roots).sort((left, right) => left.path.localeCompare(right.path));
  const reservedPaths = new Set<string>();
  const items: MediaNoteFilenameCleanupItem[] = [];
  let scanned = 0;

  for (const file of files) {
    const identity = noteIdentity(app, file);
    if (!identity) continue;
    scanned += 1;
    const targetPath = uniqueVaultFilePath(
      app.vault,
      mediaNoteFolder(file.path),
      identity.title,
      "md",
      { ignorePath: file.path, reservedPaths },
    );
    if (targetPath === file.path) continue;
    reservedPaths.add(targetPath);
    items.push({ path: file.path, title: identity.title, targetPath });
  }

  return { scanned, items };
}

export async function applyMediaNoteFilenameCleanup(
  app: App,
  plan: MediaNoteFilenameCleanupPlan,
): Promise<MediaNoteFilenameCleanupResult> {
  const details: MediaNoteFilenameCleanupDetail[] = [];
  let renamed = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of plan.items) {
    const current = app.vault.getAbstractFileByPath(item.path);
    if (!(current instanceof TFile)) {
      skipped += 1;
      details.push({ ...item, status: "skipped", message: "The note no longer exists at the reviewed path." });
      continue;
    }

    const identity = noteIdentity(app, current);
    if (!identity || identity.title !== item.title) {
      skipped += 1;
      details.push({ ...item, status: "skipped", message: "The note title or AnimeList metadata changed after review." });
      continue;
    }

    const stillExpected = uniqueVaultFilePath(
      app.vault,
      mediaNoteFolder(current.path),
      identity.title,
      "md",
      { ignorePath: current.path },
    );
    if (stillExpected !== item.targetPath) {
      skipped += 1;
      details.push({ ...item, status: "skipped", message: "The destination changed after review; run the scan again." });
      continue;
    }

    try {
      await app.fileManager.renameFile(current, item.targetPath);
      renamed += 1;
      details.push({ ...item, status: "renamed", message: "Renamed without rewriting note content or frontmatter." });
    } catch (error) {
      failed += 1;
      details.push({
        ...item,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { renamed, skipped, failed, details };
}
