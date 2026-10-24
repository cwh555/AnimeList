import type { MediaItem } from "./media-types";
import { buildScoreDashboardData, type ScoreDashboardMediaType } from "./score-dashboard/model";
import {
  completedRankingItems, rankingPositionProjection, type RankingState,
} from "./pairwise-ranking";

/** Presentation only: the existing score and ranking domains remain authoritative. */
export type PresentationKind = "scoreboard" | "ranking";
export type PresentationFormat = "text" | "png";
export type PresentationMediaType = ScoreDashboardMediaType;
export interface PresentationEntry {
  item: MediaItem;
  /** Absolute rank or score-specific annotation; never a guessed ordinal. */
  badge: string;
}
export interface PresentationSection {
  label: string;
  entries: PresentationEntry[];
}
export interface PresentationDocument {
  kind: PresentationKind;
  mediaType: PresentationMediaType;
  total: number;
  sections: PresentationSection[];
  pending: number;
}
export interface PresentationOptions {
  kind: PresentationKind;
  mediaType: PresentationMediaType;
  ranking?: RankingState | null;
  includeUnrated?: boolean;
  top?: number | null;
}

export function formatRankingPosition(first: number, last: number, total: number): string {
  return first === last ? `#${first}/${total}` : `#${first}~${last}/${total}`;
}

/** No mutation, and no false ranks inferred from rating or list insertion order. */
export function rankingLabelsForLibrary(
  items: readonly MediaItem[], state: RankingState | null | undefined,
): Map<string, string> {
  const labels = new Map<string, string>();
  if (!state) return labels;
  for (const type of ["anime", "manga", "novel"] as const) {
    const eligible = completedRankingItems(items, type);
    const projection = rankingPositionProjection(state[type], eligible);
    for (const row of projection.possible) {
      labels.set(row.path, formatRankingPosition(row.first, row.last, eligible.length));
    }
  }
  return labels;
}

export function buildPresentationDocument(
  items: readonly MediaItem[], options: PresentationOptions,
): PresentationDocument {
  const { kind, mediaType } = options;
  if (kind === "scoreboard") {
    const data = buildScoreDashboardData(items, mediaType);
    const sections = data.groups.flatMap(group => group.lanes
      .filter(lane => lane.items.length > 0)
      .map(lane => ({
        label: lane.label,
        entries: lane.items.map(item => ({ item, badge: lane.label })),
      })));
    if (options.includeUnrated && data.unrated.length) {
      sections.push({
        label: "Unrated",
        entries: data.unrated.map(item => ({ item, badge: "—" })),
      });
    }
    return { kind, mediaType, total: data.total, pending: data.unrated.length, sections };
  }
  if (mediaType === "all") throw new Error("Ranking requires one media type");
  if (!options.ranking) throw new Error("Ranking state is not loaded");
  const eligible = completedRankingItems(items, mediaType);
  const projection = rankingPositionProjection(options.ranking[mediaType], eligible);
  const byPath = new Map(eligible.map(item => [item.filePath, item]));
  const max = options.top == null ? eligible.length : Math.max(0, Math.floor(options.top));
  const confirmed = projection.confirmed.filter(row => row.position <= max)
    .flatMap(row => {
      const item = byPath.get(row.path);
      return item ? [{ item, badge: `#${row.position}` }] : [];
    });
  const known = new Set(projection.confirmed.map(row => row.path));
  const pending = projection.possible
    .filter(row => !known.has(row.path) && row.first <= max)
    .sort((a, b) => a.first - b.first || a.last - b.last || a.path.localeCompare(b.path))
    .flatMap(row => {
      const item = byPath.get(row.path);
      return item ? [{ item, badge: formatRankingPosition(row.first, row.last, eligible.length) }] : [];
    });
  return {
    kind, mediaType, total: eligible.length,
    pending: projection.possible.length - projection.confirmed.length,
    sections: [
      ...(confirmed.length ? [{ label: "Confirmed", entries: confirmed }] : []),
      ...(pending.length ? [{ label: "Pending", entries: pending }] : []),
    ],
  };
}

export function formatPresentationText(document: PresentationDocument): string {
  const title = document.kind === "scoreboard" ? "Scoreboard" : "Ranking";
  const lines = [`AnimeList ${title} — ${document.mediaType}`, `Total: ${document.total}`, ""];
  for (const section of document.sections) {
    lines.push(`## ${section.label} (${section.entries.length})`);
    for (const entry of section.entries) {
      lines.push(document.kind === "ranking"
        ? `${entry.badge}  ${entry.item.title}`
        : `- ${entry.item.title}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
