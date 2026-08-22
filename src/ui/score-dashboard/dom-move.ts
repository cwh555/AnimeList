import { buildScoreDashboardData, type ScoreDashboardMediaType } from "../../domain/score-dashboard/model";
import type { ScoreDashboardScoreChange } from "../../domain/score-dashboard/move";
import { scoreDashboardText as text } from "../../features/score-dashboard/text";
import type { MediaItem } from "../../types";
import { animateLayoutChange } from "../layout-motion";

function laneScoreValue(score: number | null): string {
  return score == null ? "unrated" : score.toFixed(1);
}

function targetLaneFor(container: HTMLElement, score: number | null): HTMLElement | null {
  const expected = laneScoreValue(score);
  return Array.from(container.querySelectorAll<HTMLElement>(".al-score-lane"))
    .find((lane) => lane.dataset.score === expected) ?? null;
}

function updateLanePlaceholder(lane: HTMLElement): void {
  const posters = lane.querySelector<HTMLElement>(".al-score-lane-posters");
  if (!posters) return;
  const empty = posters.querySelector<HTMLElement>(".al-score-lane-empty");
  if (posters.querySelector(".al-score-poster")) empty?.remove();
  else if (!empty) {
    const placeholder = createSpan({ cls: "al-score-lane-empty", text: text.emptyLane });
    posters.appendChild(placeholder);
  }
}

function updateGroupCount(group: HTMLElement): void {
  const count = group.querySelectorAll(".al-score-poster").length;
  const countElement = group.querySelector<HTMLElement>(".al-score-major-count");
  if (countElement) countElement.textContent = `${count} ${text.works}`;
}

function insertPosterByTitle(posters: HTMLElement, poster: HTMLButtonElement): void {
  const following = Array.from(posters.querySelectorAll<HTMLButtonElement>(".al-score-poster"))
    .find((candidate) => poster.title.localeCompare(candidate.title, "zh-Hant", {
      numeric: true,
      sensitivity: "base",
    }) < 0);
  posters.insertBefore(poster, following ?? null);
}

export interface ScoreDashboardDomMoveResult {
  applied: boolean;
  touchedLanes: HTMLElement[];
}

/**
 * Applies score moves by relocating the existing poster elements. No poster,
 * image, lane, or board element is recreated, so image decode state and focus
 * remain stable across reorder operations.
 */
export function applyScoreDashboardDomChanges(
  container: HTMLElement,
  changes: readonly ScoreDashboardScoreChange[],
): ScoreDashboardDomMoveResult {
  if (!changes.length) return { applied: true, touchedLanes: [] };

  const moves = changes.map((change) => {
    const poster = Array.from(container.querySelectorAll<HTMLButtonElement>(".al-score-poster"))
      .find((candidate) => candidate.dataset.filePath === change.filePath) ?? null;
    const sourceLane = poster?.closest<HTMLElement>(".al-score-lane") ?? null;
    const targetLane = targetLaneFor(container, change.nextScore);
    const targetPosters = targetLane?.querySelector<HTMLElement>(".al-score-lane-posters") ?? null;
    return { change, poster, sourceLane, targetLane, targetPosters };
  });

  if (moves.some(({ poster, sourceLane, targetLane, targetPosters }) => !poster || !sourceLane || !targetLane || !targetPosters)) {
    return { applied: false, touchedLanes: [] };
  }

  const touchedLanes = new Set<HTMLElement>();
  const touchedGroups = new Set<HTMLElement>();
  const shell = container.querySelector<HTMLElement>(".al-score-dashboard");
  shell?.classList.add("is-moving-poster");

  const movingPosters = moves.flatMap(({ poster }) => poster ? [poster] : []);
  void animateLayoutChange(movingPosters, () => {
    for (const { change, poster, sourceLane, targetLane, targetPosters } of moves) {
      if (!poster || !sourceLane || !targetLane || !targetPosters) continue;
      touchedLanes.add(sourceLane);
      touchedLanes.add(targetLane);
      const sourceGroup = sourceLane.closest<HTMLElement>(".al-score-group");
      const targetGroup = targetLane.closest<HTMLElement>(".al-score-group");
      if (sourceGroup) touchedGroups.add(sourceGroup);
      if (targetGroup) touchedGroups.add(targetGroup);

      targetPosters.querySelector(".al-score-lane-empty")?.remove();
      insertPosterByTitle(targetPosters, poster);
      poster.dataset.score = laneScoreValue(change.nextScore);
      poster.setAttribute(
        "aria-label",
        text.posterAria(poster.title, change.nextScore == null ? text.unrated : change.nextScore.toFixed(1)),
      );
    }

    touchedLanes.forEach(updateLanePlaceholder);
    touchedGroups.forEach(updateGroupCount);
  });
  container.ownerDocument.defaultView?.requestAnimationFrame(() => shell?.classList.remove("is-moving-poster"));
  return { applied: true, touchedLanes: [...touchedLanes] };
}

export function refreshScoreDashboardDomSummary(
  container: HTMLElement,
  items: readonly MediaItem[],
  type: ScoreDashboardMediaType,
): void {
  const shell = container.querySelector<HTMLElement>(".al-score-dashboard");
  const summary = container.querySelector<HTMLElement>(".al-score-dashboard-summary");
  const unratedButton = container.querySelector<HTMLButtonElement>(".al-score-dashboard-action-group .al-score-tool-button:first-child");
  const data = buildScoreDashboardData(items, type);
  if (summary) {
    summary.textContent = `${text.ratedSummary(data.rated, data.total)} · ${shell?.classList.contains("is-batch-mode") ? text.selectionHint : text.dragHint}`;
  }
  const badge = unratedButton?.querySelector<HTMLElement>(".al-score-tool-badge");
  if (badge) badge.textContent = String(data.unrated.length);
  if (unratedButton) {
    const controlLabel = unratedButton.classList.contains("is-active") ? text.hideUnrated : text.showUnrated;
    unratedButton.setAttribute("aria-label", text.unratedControlLabel(controlLabel, data.unrated.length));
  }
}
