import { TFile, type App } from "obsidian";
import { stringValue } from "../domain/value-normalization";
import {
  findLegacyDefaultCoverCandidate,
  removeLegacyDefaultCoverLine,
  type LegacyCoverCleanupCandidate,
} from "../domain/version-cleanup";
import { getScopedMarkdownFiles } from "../vault-scope";

export interface VersionCleanupPlanItem extends LegacyCoverCleanupCandidate {
  path: string;
  title: string;
}

export interface VersionCleanupPlan {
  scanned: number;
  items: VersionCleanupPlanItem[];
}

export interface VersionCleanupApplyDetail {
  path: string;
  title: string;
  status: "updated" | "skipped" | "failed";
  message: string;
}

export interface VersionCleanupApplyResult {
  planned: number;
  updated: number;
  skipped: number;
  failed: number;
  details: VersionCleanupApplyDetail[];
}

export async function planDuplicateDefaultCoverCleanup(
  app: App,
  roots: readonly string[],
): Promise<VersionCleanupPlan> {
  const files = getScopedMarkdownFiles(app, [...roots]);
  const items: VersionCleanupPlanItem[] = [];
  for (const file of files) {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) continue;
    const markdown = await app.vault.cachedRead(file);
    const candidate = findLegacyDefaultCoverCandidate(markdown, frontmatter);
    if (!candidate) continue;
    items.push({
      ...candidate,
      path: file.path,
      title: stringValue(frontmatter.title, file.basename).trim() || file.basename,
    });
  }
  return { scanned: files.length, items };
}

function matchingCurrentCandidate(
  markdown: string,
  frontmatter: Record<string, unknown>,
  planned: VersionCleanupPlanItem,
): LegacyCoverCleanupCandidate | null {
  const current = findLegacyDefaultCoverCandidate(markdown, frontmatter);
  if (!current) return null;
  return current.lineText === planned.lineText && current.coverPath === planned.coverPath
    ? current
    : null;
}

export async function applyDuplicateDefaultCoverCleanup(
  app: App,
  plan: VersionCleanupPlan,
): Promise<VersionCleanupApplyResult> {
  const result: VersionCleanupApplyResult = {
    planned: plan.items.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const planned of plan.items) {
    const abstract = app.vault.getAbstractFileByPath(planned.path);
    if (!(abstract instanceof TFile)) {
      result.skipped += 1;
      result.details.push({ ...planned, status: "skipped", message: "The note no longer exists." });
      continue;
    }
    const file = abstract;
    try {
      const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
      if (!frontmatter) {
        result.skipped += 1;
        result.details.push({ ...planned, status: "skipped", message: "Frontmatter is no longer available." });
        continue;
      }
      const markdown = await app.vault.cachedRead(file);
      const candidate = matchingCurrentCandidate(markdown, frontmatter, planned);
      if (!candidate) {
        result.skipped += 1;
        result.details.push({ ...planned, status: "skipped", message: "The note changed after review; nothing was removed." });
        continue;
      }
      const next = removeLegacyDefaultCoverLine(markdown, candidate);
      if (next === markdown) {
        result.skipped += 1;
        result.details.push({ ...planned, status: "skipped", message: "No safe matching line remained." });
        continue;
      }
      await app.vault.modify(file, next);
      result.updated += 1;
      result.details.push({ ...planned, status: "updated", message: "Removed the duplicate generated cover embed." });
    } catch (error) {
      result.failed += 1;
      result.details.push({
        ...planned,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}
