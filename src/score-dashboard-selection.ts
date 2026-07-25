export const SCORE_DASHBOARD_DRAG_DATA_TYPE = "application/x-animelist-score-path";

export interface ScoreDashboardSelectionClickResult {
  handled: boolean;
  batchMode: boolean;
  selected: boolean | null;
}

export function toggleScoreDashboardPathSelection(selectedPaths: Set<string>, path: string): boolean {
  if (selectedPaths.has(path)) {
    selectedPaths.delete(path);
    return false;
  }
  selectedPaths.add(path);
  return true;
}

export function scoreDashboardShouldEnterBatchMode(batchMode: boolean, shiftKey: boolean): boolean {
  return !batchMode && shiftKey;
}

export function applyScoreDashboardSelectionClick(
  selectedPaths: Set<string>,
  path: string,
  batchMode: boolean,
  shiftKey: boolean,
): ScoreDashboardSelectionClickResult {
  if (!batchMode && !shiftKey) {
    return { handled: false, batchMode: false, selected: null };
  }
  return {
    handled: true,
    batchMode: true,
    selected: toggleScoreDashboardPathSelection(selectedPaths, path),
  };
}

export function scoreDashboardDraggedPaths(
  sourcePath: string,
  batchMode: boolean,
  selectedPaths: ReadonlySet<string>,
): string[] {
  if (!sourcePath) return [];
  if (!batchMode) return [sourcePath];
  if (!selectedPaths.has(sourcePath)) return [];
  return Array.from(selectedPaths).filter(Boolean);
}

export function serializeScoreDashboardDraggedPaths(paths: readonly string[]): string {
  return JSON.stringify(Array.from(new Set(paths.filter(Boolean))));
}

export function parseScoreDashboardDraggedPaths(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const parsedPaths: unknown[] = parsed;
      return Array.from(new Set(parsedPaths.filter((path): path is string => typeof path === "string" && path.length > 0)));
    }
  } catch {
    // Older dashboard builds stored a single plain-text path in this payload.
  }
  return [trimmed];
}
