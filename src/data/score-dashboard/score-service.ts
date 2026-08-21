import { TFile, type App } from "obsidian";
import type { ScoreDashboardScoreChange, ScoreDashboardTargetScore } from "../../domain/score-dashboard/move";
import { scoreDashboardText } from "../../features/score-dashboard/text";

interface FrontmatterSnapshot {
  file: TFile;
  hadScore: boolean;
  score: unknown;
  hadUpdatedAt: boolean;
  updatedAt: unknown;
  hadMetadataUpdatedAt: boolean;
  metadataUpdatedAt: unknown;
}

export function applyScoreDashboardFrontmatter(
  frontmatter: Record<string, unknown>,
  nextScore: ScoreDashboardTargetScore,
): void {
  if (nextScore == null) delete frontmatter.score;
  else frontmatter.score = nextScore;
  delete frontmatter.updated_at;
  delete frontmatter.metadata_updated_at;
}

function restoreField(
  frontmatter: Record<string, unknown>,
  key: string,
  hadValue: boolean,
  value: unknown,
): void {
  if (hadValue) frontmatter[key] = value;
  else delete frontmatter[key];
}

function snapshotFile(app: App, path: string): FrontmatterSnapshot {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) throw new Error(scoreDashboardText.noteMissing(path));
  const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  return {
    file,
    hadScore: Object.hasOwn(frontmatter, "score"),
    score: frontmatter.score,
    hadUpdatedAt: Object.hasOwn(frontmatter, "updated_at"),
    updatedAt: frontmatter.updated_at,
    hadMetadataUpdatedAt: Object.hasOwn(frontmatter, "metadata_updated_at"),
    metadataUpdatedAt: frontmatter.metadata_updated_at,
  };
}

export async function applyScoreDashboardChanges(
  app: App,
  changes: readonly ScoreDashboardScoreChange[],
): Promise<void> {
  const snapshots = new Map(changes.map((change) => [change.filePath, snapshotFile(app, change.filePath)]));
  const applied: FrontmatterSnapshot[] = [];
  try {
    for (const change of changes) {
      const snapshot = snapshots.get(change.filePath);
      if (!snapshot) continue;
      await app.fileManager.processFrontMatter(snapshot.file, (frontmatter) => {
        applyScoreDashboardFrontmatter(frontmatter, change.nextScore);
      });
      applied.push(snapshot);
    }
  } catch (error) {
    const rollbackFailures: string[] = [];
    for (const snapshot of applied.reverse()) {
      try {
        await app.fileManager.processFrontMatter(snapshot.file, (frontmatter) => {
          restoreField(frontmatter, "score", snapshot.hadScore, snapshot.score);
          restoreField(frontmatter, "updated_at", snapshot.hadUpdatedAt, snapshot.updatedAt);
          restoreField(frontmatter, "metadata_updated_at", snapshot.hadMetadataUpdatedAt, snapshot.metadataUpdatedAt);
        });
      } catch {
        rollbackFailures.push(snapshot.file.path);
      }
    }
    const reason = error instanceof Error ? error.message : String(error);
    const rollback = rollbackFailures.length
      ? scoreDashboardText.rollbackFailed(rollbackFailures.join("、"))
      : scoreDashboardText.rollbackSucceeded;
    throw new Error(scoreDashboardText.updateFailed(reason, rollback));
  }
}
