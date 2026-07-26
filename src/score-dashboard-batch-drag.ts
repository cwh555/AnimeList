import { ScoreDashboardDragAutoScroller } from "./score-dashboard-drag-scroll";
import { createScoreDashboardDragPreview } from "./score-dashboard-drag-preview";
import {
  SCORE_DASHBOARD_DRAG_DATA_TYPE,
  parseScoreDashboardDraggedPaths,
  scoreDashboardDraggedPaths,
  scoreDashboardShouldEnterBatchMode,
  serializeScoreDashboardDraggedPaths,
} from "./score-dashboard-selection";
import { planScoreDashboardMove, type ScoreDashboardScoreChange } from "./score-dashboard-move";
import { scoreDashboardText as text } from "./score-dashboard-text";
import { renderScoreDashboard, type ScoreDashboardUiAdapters, type ScoreDashboardUiState } from "./score-dashboard-ui";
import type { MediaItem } from "./types";

const controllers = new WeakMap<HTMLElement, AbortController>();

function applyLocalChanges(items: readonly MediaItem[], changes: readonly ScoreDashboardScoreChange[]): void {
  const scores = new Map(changes.map((change) => [change.filePath, change.nextScore]));
  items.forEach((item) => {
    if (scores.has(item.filePath)) item.score = scores.get(item.filePath) ?? null;
  });
}

function targetScore(lane: HTMLElement): number | null {
  return lane.dataset.score === "unrated" ? null : Number(lane.dataset.score);
}

export function renderScoreDashboardWithBatchDrag(
  container: HTMLElement,
  items: readonly MediaItem[],
  initialState: ScoreDashboardUiState,
  adapters: ScoreDashboardUiAdapters,
): void {
  controllers.get(container)?.abort();
  let currentState = { ...initialState };

  const render = (scrollTop: number, restoreBatchMode = false): void => {
    controllers.get(container)?.abort();
    renderScoreDashboard(container, items, currentState, {
      ...adapters,
      onStateChange: (nextState) => {
        currentState = { ...nextState };
        adapters.onStateChange(nextState);
      },
    });

    const controller = new AbortController();
    controllers.set(container, controller);
    const options = { signal: controller.signal };
    const shell = container.querySelector<HTMLElement>(".al-score-dashboard");
    const batchButton = container.querySelector<HTMLButtonElement>(
      ".al-score-dashboard-action-group .al-score-tool-button:last-child",
    );
    if (!shell || !batchButton) return;

    let dragPreview: HTMLElement | null = null;
    let autoScroller: ScoreDashboardDragAutoScroller | null = null;
    let operationPending = false;

    const selectedPosters = (): HTMLButtonElement[] => Array.from(
      container.querySelectorAll<HTMLButtonElement>(".al-score-poster.is-selected"),
    );
    const syncDraggablePosters = (): void => {
      const batchMode = shell.classList.contains("is-batch-mode");
      container.querySelectorAll<HTMLButtonElement>(".al-score-poster").forEach((poster) => {
        poster.draggable = !batchMode || poster.classList.contains("is-selected");
        poster.setAttribute("aria-grabbed", String(batchMode && poster.classList.contains("is-selected")));
      });
    };
    const clearDropTargets = (): void => {
      container.querySelectorAll<HTMLElement>(".al-score-lane.is-drop-target")
        .forEach((lane) => lane.classList.remove("is-drop-target"));
    };
    const finishDrag = (): void => {
      autoScroller?.stop();
      autoScroller = null;
      dragPreview?.remove();
      dragPreview = null;
      selectedPosters().forEach((poster) => poster.classList.remove("is-batch-dragging"));
      clearDropTargets();
    };

    container.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const poster = target.closest<HTMLButtonElement>(".al-score-poster");
      if (poster && scoreDashboardShouldEnterBatchMode(shell.classList.contains("is-batch-mode"), event.shiftKey)) {
        batchButton.click();
      }
    }, { ...options, capture: true });

    container.addEventListener("click", () => queueMicrotask(syncDraggablePosters), options);

    container.addEventListener("dragstart", (event) => {
      if (!shell.classList.contains("is-batch-mode")) return;
      const target = event.target;
      const poster = target instanceof Element ? target.closest<HTMLButtonElement>(".al-score-poster") : null;
      const dataTransfer = event.dataTransfer;
      if (!poster || !dataTransfer || !poster.classList.contains("is-selected")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const selected = selectedPosters();
      const paths = scoreDashboardDraggedPaths(
        poster.dataset.filePath ?? "",
        true,
        new Set(selected.map((candidate) => candidate.dataset.filePath ?? "")),
      );
      if (!paths.length) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.stopPropagation();
      dataTransfer.effectAllowed = "move";
      dataTransfer.setData(SCORE_DASHBOARD_DRAG_DATA_TYPE, serializeScoreDashboardDraggedPaths(paths));
      dataTransfer.setData("text/plain", paths.join("\n"));
      selected.forEach((candidate) => candidate.classList.add("is-batch-dragging"));
      dragPreview = createScoreDashboardDragPreview(container.ownerDocument, poster, paths.length);
      dataTransfer.setDragImage(dragPreview, dragPreview.offsetWidth / 2, dragPreview.offsetHeight / 2);
      autoScroller = new ScoreDashboardDragAutoScroller(container);
      autoScroller.start();
    }, { ...options, capture: true });

    container.addEventListener("dragover", (event) => {
      if (!shell.classList.contains("is-batch-mode") || !event.dataTransfer?.types.includes(SCORE_DASHBOARD_DRAG_DATA_TYPE)) return;
      autoScroller?.update(event.clientY);
      const target = event.target;
      const lane = target instanceof Element ? target.closest<HTMLElement>(".al-score-lane") : null;
      if (!lane) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearDropTargets();
      lane.classList.add("is-drop-target");
    }, { ...options, capture: true });

    container.addEventListener("drop", (event) => {
      if (!shell.classList.contains("is-batch-mode")) return;
      const target = event.target;
      const lane = target instanceof Element ? target.closest<HTMLElement>(".al-score-lane") : null;
      const paths = parseScoreDashboardDraggedPaths(event.dataTransfer?.getData(SCORE_DASHBOARD_DRAG_DATA_TYPE) ?? "");
      if (!lane || !paths.length) return;

      event.preventDefault();
      event.stopPropagation();
      finishDrag();
      if (operationPending) return;
      const sources = paths.flatMap((path) => {
        const item = items.find((candidate) => candidate.filePath === path);
        return item ? [{ filePath: item.filePath, score: item.score }] : [];
      });
      const plan = planScoreDashboardMove(sources, targetScore(lane));
      if (!plan.changes.length) {
        adapters.showNotice(text.moveNoChange);
        return;
      }

      operationPending = true;
      const preservedScrollTop = container.scrollTop;
      void adapters.applyChanges(plan.changes)
        .then(() => {
          applyLocalChanges(items, plan.changes);
          adapters.showNotice(text.moveSuccess(plan.changes.length));
          render(preservedScrollTop, true);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          adapters.showNotice(text.moveFailed(message));
        })
        .finally(() => { operationPending = false; });
    }, { ...options, capture: true });

    container.addEventListener("dragend", finishDrag, { ...options, capture: true });
    container.ownerDocument.defaultView?.addEventListener("blur", finishDrag, options);
    if (restoreBatchMode) batchButton.click();
    syncDraggablePosters();
    container.ownerDocument.defaultView?.requestAnimationFrame(() => { container.scrollTop = scrollTop; });
  };

  render(container.scrollTop);
}
