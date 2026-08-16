import { normalizeRating } from "../rating";

export type ScoreDashboardTargetScore = number | null;

export interface ScoreDashboardMoveSource {
  filePath: string;
  score: number | null;
}

export interface ScoreDashboardScoreChange {
  filePath: string;
  previousScore: number | null;
  nextScore: ScoreDashboardTargetScore;
}

export interface ScoreDashboardMovePlan {
  changes: ScoreDashboardScoreChange[];
  blockedUnratedPaths: string[];
  clampedLowPaths: string[];
  clampedHighPaths: string[];
}

export const SCORE_DASHBOARD_SHIFT_STEP = 0.5;
export const SCORE_DASHBOARD_MIN_SCORE = 0;
export const SCORE_DASHBOARD_MAX_SCORE = 10;

function uniqueSources(sources: readonly ScoreDashboardMoveSource[]): ScoreDashboardMoveSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (!source.filePath || seen.has(source.filePath)) return false;
    seen.add(source.filePath);
    return true;
  });
}

function normalizedSourceScore(score: number | null): number | null {
  const normalized = normalizeRating(score);
  return normalized.kind === "valid" ? normalized.value : null;
}

function normalizeTargetScore(score: ScoreDashboardTargetScore): ScoreDashboardTargetScore {
  if (score == null) return null;
  if (!Number.isFinite(score)) throw new RangeError("Score target must be finite.");
  const normalized = Math.round(score * 2) / 2;
  if (normalized < SCORE_DASHBOARD_MIN_SCORE || normalized > SCORE_DASHBOARD_MAX_SCORE) {
    throw new RangeError("Score target must be between 0 and 10.");
  }
  return normalized;
}

export function planScoreDashboardMove(
  sources: readonly ScoreDashboardMoveSource[],
  targetScore: ScoreDashboardTargetScore,
): ScoreDashboardMovePlan {
  const target = normalizeTargetScore(targetScore);
  const changes = uniqueSources(sources).flatMap((source) => {
    const current = normalizedSourceScore(source.score);
    if (current === target) return [];
    return [{ filePath: source.filePath, previousScore: source.score, nextScore: target }];
  });
  return { changes, blockedUnratedPaths: [], clampedLowPaths: [], clampedHighPaths: [] };
}

export function planScoreDashboardShift(
  sources: readonly ScoreDashboardMoveSource[],
  direction: -1 | 1,
): ScoreDashboardMovePlan {
  const unique = uniqueSources(sources);
  const blockedUnratedPaths = unique
    .filter((source) => normalizedSourceScore(source.score) == null)
    .map((source) => source.filePath);
  if (blockedUnratedPaths.length) {
    return { changes: [], blockedUnratedPaths, clampedLowPaths: [], clampedHighPaths: [] };
  }

  const clampedLowPaths: string[] = [];
  const clampedHighPaths: string[] = [];
  const changes = unique.map((source) => {
    const current = normalizedSourceScore(source.score) ?? SCORE_DASHBOARD_MIN_SCORE;
    const shifted = current + direction * SCORE_DASHBOARD_SHIFT_STEP;
    if (shifted < SCORE_DASHBOARD_MIN_SCORE) clampedLowPaths.push(source.filePath);
    if (shifted > SCORE_DASHBOARD_MAX_SCORE) clampedHighPaths.push(source.filePath);
    const nextScore = Math.min(SCORE_DASHBOARD_MAX_SCORE, Math.max(SCORE_DASHBOARD_MIN_SCORE, shifted));
    return { filePath: source.filePath, previousScore: source.score, nextScore };
  });
  return { changes, blockedUnratedPaths: [], clampedLowPaths, clampedHighPaths };
}

export function scoreDashboardPlanNeedsClampConfirmation(plan: ScoreDashboardMovePlan): boolean {
  return plan.clampedLowPaths.length > 0 || plan.clampedHighPaths.length > 0;
}
