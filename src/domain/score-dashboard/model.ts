import { formatRating, normalizeRating } from "../rating";
import type { MediaItem, MediaType } from "../../types";

export type ScoreDashboardMediaType = "all" | MediaType;
export type ScoreDashboardLabelLayout = "compact" | "regular";
export interface ScoreDashboardLane { score: number; label: string; items: MediaItem[]; }
export interface ScoreDashboardGroup { major: number; lanes: ScoreDashboardLane[]; itemCount: number; }
export interface ScoreDashboardData { groups: ScoreDashboardGroup[]; unrated: MediaItem[]; total: number; rated: number; }
export interface ScoreDashboardPosterMetrics {
  scale: number;
  scaleRatio: number;
  posterWidth: number;
  posterHeight: number;
  gap: number;
  verticalMargin: number;
  laneMinHeight: number;
  labelLayout: ScoreDashboardLabelLayout;
}

export const SCORE_DASHBOARD_MIN_SCALE = 20;
export const SCORE_DASHBOARD_MAX_SCALE = 200;
export const SCORE_DASHBOARD_DEFAULT_SCALE = 100;

// The library thumbnail view uses 145px as a grid-column minimum, not as a
// fixed image-only size. In the score lanes, half of that visual footprint is
// the closer equivalent because the cover has no card body or surrounding grid.
export const SCORE_DASHBOARD_THUMBNAIL_WIDTH = 72.5;
export const SCORE_DASHBOARD_THUMBNAIL_HEIGHT = 108.75;
export const SCORE_DASHBOARD_THUMBNAIL_GAP = 5;
export const SCORE_DASHBOARD_THUMBNAIL_VERTICAL_MARGIN = 5;
const SCORE_DASHBOARD_COMPACT_LABEL_MAX_SCALE = 40;

export function clampScoreDashboardScale(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return SCORE_DASHBOARD_DEFAULT_SCALE;
  return Math.min(SCORE_DASHBOARD_MAX_SCALE, Math.max(SCORE_DASHBOARD_MIN_SCALE, parsed));
}

export function normalizeScoreDashboardScale(value: unknown): number {
  return Math.round(clampScoreDashboardScale(value) / 5) * 5;
}

export function scoreDashboardPosterMetrics(value: unknown): ScoreDashboardPosterMetrics {
  const scale = clampScoreDashboardScale(value);
  const scaleRatio = scale / 100;
  const posterWidth = SCORE_DASHBOARD_THUMBNAIL_WIDTH * scaleRatio;
  const posterHeight = SCORE_DASHBOARD_THUMBNAIL_HEIGHT * scaleRatio;
  const gap = SCORE_DASHBOARD_THUMBNAIL_GAP * scaleRatio;
  const verticalMargin = SCORE_DASHBOARD_THUMBNAIL_VERTICAL_MARGIN * scaleRatio;
  return {
    scale,
    scaleRatio,
    posterWidth,
    posterHeight,
    gap,
    verticalMargin,
    laneMinHeight: posterHeight + verticalMargin * 2,
    labelLayout: scale <= SCORE_DASHBOARD_COMPACT_LABEL_MAX_SCALE ? "compact" : "regular",
  };
}

export function scoreDashboardScores(): number[] {
  return Array.from({ length: 21 }, (_, index) => Number((10 - index * 0.5).toFixed(1)));
}

export function filterScoreDashboardItems(items: readonly MediaItem[], type: ScoreDashboardMediaType): MediaItem[] {
  return type === "all" ? [...items] : items.filter((item) => item.mediaType === type);
}

function titleOrder(left: MediaItem, right: MediaItem): number {
  return left.title.localeCompare(right.title, "zh-Hant", { numeric: true, sensitivity: "base" });
}

export function buildScoreDashboardData(
  inputItems: readonly MediaItem[],
  type: ScoreDashboardMediaType = "all",
): ScoreDashboardData {
  const items = filterScoreDashboardItems(inputItems, type);
  const lanes = new Map(scoreDashboardScores().map((score) => [score, [] as MediaItem[]]));
  const unrated: MediaItem[] = [];

  for (const item of items) {
    const normalized = normalizeRating(item.score);
    if (normalized.kind !== "valid" || normalized.value == null) {
      unrated.push(item);
      continue;
    }
    lanes.get(normalized.value)?.push(item);
  }

  for (const laneItems of lanes.values()) laneItems.sort(titleOrder);
  unrated.sort(titleOrder);

  const groups: ScoreDashboardGroup[] = [];
  for (let major = 10; major >= 0; major -= 1) {
    const scores = major === 10 ? [10] : [major + 0.5, major];
    const groupLanes = scores.map((score) => ({
      score,
      label: formatRating(score),
      items: lanes.get(score) ?? [],
    }));
    groups.push({
      major,
      lanes: groupLanes,
      itemCount: groupLanes.reduce((total, lane) => total + lane.items.length, 0),
    });
  }

  return {
    groups,
    unrated,
    total: items.length,
    rated: items.length - unrated.length,
  };
}
