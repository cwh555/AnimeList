import { ScoreDashboardDragAutoScroller } from "../../domain/score-dashboard/drag-scroll";
import { createScoreDashboardDragPreview } from "./drag-preview";
import {
  SCORE_DASHBOARD_DRAG_DATA_TYPE,
  parseScoreDashboardDraggedPaths,
  scoreDashboardDraggedPaths,
  scoreDashboardShouldEnterBatchMode,
  serializeScoreDashboardDraggedPaths,
} from "../../domain/score-dashboard/selection";
import { planScoreDashboardMove, type ScoreDashboardScoreChange } from "../../domain/score-dashboard/move";
import { scoreDashboardText as text } from "../../features/score-dashboard/text";
import {
  installScoreDashboardTouchInteractions,
  shouldExitScoreDashboardTouchBatchMode,
} from "./touch";
import { renderScoreDashboard, type ScoreDashboardUiAdapters, type ScoreDashboardUiState } from "./renderer";
import { applyScoreDashboardDomChanges, refreshScoreDashboardDomSummary } from "./dom-move";
import type { MediaItem } from "../../types";
import { installCoverImageLoading } from "../cover-image-loading";
import { isolateAnimeListViewport } from "../mobile-swipe-isolation";

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
  persistentChrome?: HTMLElement,
): void {
  controllers.get(container)?.abort();
  let currentState = { ...initialState };
  let touchInputSeen = false;
  let lastPointerInput: "touch" | "mouse" | null = null;

  const render = (scrollTop: number, restoreBatchMode = false): void => {
    controllers.get(container)?.abort();
    let scheduleTouchBatchInvariant = (): void => {};
    renderScoreDashboard(container, items, currentState, {
      ...adapters,
      applyChanges: async (changes) => {
        await adapters.applyChanges(changes);
        container.ownerDocument.defaultView?.setTimeout(scheduleTouchBatchInvariant, 0);
      },
      onStateChange: (nextState) => {
        currentState = { ...nextState };
        adapters.onStateChange(nextState);
      },
    });

    // Internal score-board rerenders must not erase the shared rating/ranking switch.
    if (persistentChrome) container.prepend(persistentChrome);
    const controller = new AbortController();
    controllers.set(container, controller);
    const options = { signal: controller.signal };
    const coverLoading = installCoverImageLoading(container, {
      selector: "img.al-score-poster-image",
      eagerCount: 12,
    });
    controller.signal.addEventListener("abort", () => coverLoading.disconnect(), { once: true });
    const shell = container.querySelector<HTMLElement>(".al-score-dashboard");
    // The shared Workspace shell already owns every nested page; only the
    // legacy standalone Score Dashboard needs an independent viewport boundary.
    if (shell && container.classList.contains("animelist-score-dashboard-view")
      && !container.closest?.(".al-workspace-shell")) {
      isolateAnimeListViewport(container, shell);
    }
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
    let batchInvariantQueued = false;
    scheduleTouchBatchInvariant = (): void => {
      if (!touchInputSeen || lastPointerInput !== "touch" || batchInvariantQueued) return;
      batchInvariantQueued = true;
      queueMicrotask(() => {
        batchInvariantQueued = false;
        if (!shouldExitScoreDashboardTouchBatchMode(
          touchInputSeen,
          shell.classList.contains("is-batch-mode"),
          selectedPosters().length,
        )) return;
        batchButton.click();
      });
    };
    const isTouchDevice = (): boolean => lastPointerInput === "touch"
      || (lastPointerInput !== "mouse" && (
        container.ownerDocument.body.classList.contains("is-mobile")
        || container.ownerDocument.defaultView?.matchMedia?.("(pointer: coarse)")?.matches === true
      ));
    const syncDraggablePosters = (): void => {
      const batchMode = shell.classList.contains("is-batch-mode");
      container.querySelectorAll<HTMLButtonElement>(".al-score-poster").forEach((poster) => {
        poster.draggable = !isTouchDevice() && (!batchMode || poster.classList.contains("is-selected"));
        poster.setAttribute("aria-grabbed", String(!isTouchDevice() && batchMode && poster.classList.contains("is-selected")));
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
      container.querySelectorAll<HTMLElement>(".al-score-poster.is-dragging")
        .forEach((poster) => poster.classList.remove("is-dragging"));
      selectedPosters().forEach((poster) => poster.classList.remove("is-batch-dragging"));
      clearDropTargets();
    };

    const applyPathDrop = (paths: readonly string[], lane: HTMLElement, restoreBatchMode: boolean): void => {
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
          const local = applyScoreDashboardDomChanges(container, plan.changes);
          if (!local.applied) {
            render(preservedScrollTop, restoreBatchMode);
          } else {
            refreshScoreDashboardDomSummary(container, items, currentState.type);
            // Clear the batch selection through the renderer's own state machine
            // without replacing the board. Re-enter only for desktop batch drag.
            if (shell.classList.contains("is-batch-mode")) batchButton.click();
            if (restoreBatchMode && !shell.classList.contains("is-batch-mode")) batchButton.click();
            container.scrollTop = preservedScrollTop;
            syncDraggablePosters();
          }
          adapters.showNotice(text.moveSuccess(plan.changes.length));
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          adapters.showNotice(text.moveFailed(message));
        })
        .finally(() => { operationPending = false; });
    };

    container.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const poster = target.closest<HTMLButtonElement>(".al-score-poster");
      if (poster && scoreDashboardShouldEnterBatchMode(shell.classList.contains("is-batch-mode"), event.shiftKey)) {
        batchButton.click();
      }
    }, { ...options, capture: true });

    container.addEventListener("click", () => {
      queueMicrotask(() => {
        syncDraggablePosters();
        coverLoading.sync();
      });
      scheduleTouchBatchInvariant();
    }, options);

    container.addEventListener("dragstart", (event) => {
      if (isTouchDevice()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
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
      applyPathDrop(paths, lane, true);
    }, { ...options, capture: true });

    let touchDragPaths: string[] = [];
    let touchDragOffset = { x: 0, y: 0 };
    const touchLaneAt = (point: { x: number; y: number }): HTMLElement | null => {
      const target = container.ownerDocument.elementFromPoint(point.x, point.y);
      const lane = target?.closest<HTMLElement>(".al-score-lane") ?? null;
      return lane && container.contains(lane) ? lane : null;
    };
    const positionTouchPreview = (point: { x: number; y: number }): void => {
      if (!dragPreview) return;
      dragPreview.style.transform = `translate3d(${Math.round(point.x - touchDragOffset.x)}px, ${Math.round(point.y - touchDragOffset.y)}px, 0)`;
    };
    installScoreDashboardTouchInteractions(container, controller.signal, {
      onTouchInput: () => {
        touchInputSeen = true;
        lastPointerInput = "touch";
        syncDraggablePosters();
      },
      onDragStart: (poster, point) => {
        if (operationPending || dragPreview) return false;
        const source = poster.dataset.filePath ?? "";
        const selected = new Set(selectedPosters().map((item) => item.dataset.filePath ?? ""));
        const batchSelected = shell.classList.contains("is-batch-mode") && selected.has(source);
        touchDragPaths = scoreDashboardDraggedPaths(source, batchSelected, selected);
        if (!touchDragPaths.length) return false;
        const rect = poster.getBoundingClientRect();
        touchDragOffset = { x: point.x - rect.left, y: point.y - rect.top };
        dragPreview = createScoreDashboardDragPreview(container.ownerDocument, poster, touchDragPaths.length);
        dragPreview.style.left = "0px";
        dragPreview.style.top = "0px";
        positionTouchPreview(point);
        poster.classList.add("is-dragging");
        autoScroller = new ScoreDashboardDragAutoScroller(container);
        autoScroller.start();
        return true;
      },
      onDragMove: (point) => {
        positionTouchPreview(point);
        autoScroller?.update(point.y);
        clearDropTargets();
        touchLaneAt(point)?.classList.add("is-drop-target");
      },
      onDragEnd: (point, cancelled) => {
        const paths = touchDragPaths;
        touchDragPaths = [];
        const lane = cancelled ? null : touchLaneAt(point);
        if (lane && paths.length) applyPathDrop(paths, lane, false);
        else finishDrag();
      },
    });
    // A hybrid device must not lose desktop drag-and-drop for the rest of the
    // session merely because its touchscreen was used once.
    container.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || lastPointerInput === "mouse") return;
      lastPointerInput = "mouse";
      syncDraggablePosters();
    }, { ...options, capture: true });

    container.addEventListener("dragend", finishDrag, { ...options, capture: true });
    container.ownerDocument.defaultView?.addEventListener("blur", finishDrag, options);
    if (restoreBatchMode) batchButton.click();
    syncDraggablePosters();
    container.ownerDocument.defaultView?.requestAnimationFrame(() => { container.scrollTop = scrollTop; });
  };

  render(container.scrollTop);
}

export function disposeScoreDashboardInteractions(container: HTMLElement): void {
  controllers.get(container)?.abort();
  controllers.delete(container);
}
