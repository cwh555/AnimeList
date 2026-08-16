import { isLibraryRelevantPath } from "../../data/library-change-scope";

export const SCORE_DASHBOARD_LOCAL_REFRESH_GUARD_MS = 1500;

export class ScoreDashboardRefreshGuard {
  private readonly untilByPath = new Map<string, number>();

  constructor(private readonly durationMs = SCORE_DASHBOARD_LOCAL_REFRESH_GUARD_MS) {}

  mark(paths: readonly string[], now = Date.now()): void {
    this.prune(now);
    const until = now + Math.max(0, this.durationMs);
    paths.forEach((path) => {
      if (path) this.untilByPath.set(path, until);
    });
  }

  shouldSuppress(path: string, now = Date.now()): boolean {
    const until = this.untilByPath.get(path);
    if (until == null) return false;
    if (now <= until) return true;
    this.untilByPath.delete(path);
    return false;
  }

  release(paths: readonly string[]): void {
    paths.forEach((path) => this.untilByPath.delete(path));
  }

  private prune(now: number): void {
    this.untilByPath.forEach((until, path) => {
      if (until < now) this.untilByPath.delete(path);
    });
  }
}

export function shouldRefreshScoreDashboardPath(
  path: string,
  scanRoots: readonly string[],
  coverFolder: string,
): boolean {
  return isLibraryRelevantPath(path, scanRoots, coverFolder);
}

export function shouldRefreshScoreDashboardMetadata(
  path: string,
  scanRoots: readonly string[],
  coverFolder: string,
  guard: ScoreDashboardRefreshGuard,
  now = Date.now(),
): boolean {
  return shouldRefreshScoreDashboardPath(path, scanRoots, coverFolder)
    && !guard.shouldSuppress(path, now);
}

export function shouldRefreshScoreDashboardRename(
  oldPath: string,
  newPath: string,
  scanRoots: readonly string[],
  coverFolder: string,
): boolean {
  return shouldRefreshScoreDashboardPath(oldPath, scanRoots, coverFolder)
    || shouldRefreshScoreDashboardPath(newPath, scanRoots, coverFolder);
}
