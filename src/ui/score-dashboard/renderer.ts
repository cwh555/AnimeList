import { setIcon } from "obsidian";
import {
  SCORE_DASHBOARD_MAX_SCALE,
  SCORE_DASHBOARD_MIN_SCALE,
  buildScoreDashboardData,
  filterScoreDashboardItems,
  normalizeScoreDashboardScale,
  scoreDashboardPosterMetrics,
  scoreDashboardScores,
} from "../../domain/score-dashboard/model";
import {
  planScoreDashboardMove,
  planScoreDashboardShift,
  scoreDashboardPlanNeedsClampConfirmation,
  type ScoreDashboardMovePlan,
  type ScoreDashboardScoreChange,
  type ScoreDashboardTargetScore,
} from "../../domain/score-dashboard/move";
import {
  preserveScoreDashboardAnchorScrollTop,
  scoreDashboardScaleFromWheel,
  scoreDashboardWheelIntent,
} from "../../domain/score-dashboard/gesture";
import type { ScoreDashboardClampSummary } from "./operation-ui";
import { scoreDashboardText as text } from "../../features/score-dashboard/text";
import type { MediaItem } from "../../types";
import type { ScoreDashboardMediaType } from "../../domain/score-dashboard/model";
import { applyScoreDashboardDomChanges } from "./dom-move";
import { animateLayoutChange } from "../layout-motion";

export interface ScoreDashboardUiState {
  type: ScoreDashboardMediaType;
  scale: number;
  showUnrated: boolean;
}

export interface ScoreDashboardUiAdapters {
  openFile(path: string): void | Promise<void>;
  applyChanges(changes: readonly ScoreDashboardScoreChange[]): Promise<void>;
  confirmClamp(summary: ScoreDashboardClampSummary): Promise<boolean>;
  showNotice(message: string): void;
  onStateChange(state: ScoreDashboardUiState): void;
}

type ScoreDashboardAppliedHandler = (changes: readonly ScoreDashboardScoreChange[]) => boolean;

const TYPE_OPTIONS: Array<[ScoreDashboardMediaType, string]> = [
  ["all", text.all], ["anime", text.anime], ["manga", text.manga], ["novel", text.novel],
];
const DRAG_DATA_TYPE = "application/x-animelist-score-path";

function create<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", label = ""): HTMLElementTagNameMap[K] {
  const element = createEl(tag);
  if (className) element.className = className;
  if (label) element.textContent = label;
  return element;
}

function scoreColor(score: number): string {
  const hue = Math.round(8 + score * 26.2);
  return `hsl(${hue} 72% 62%)`;
}

function typeCount(items: readonly MediaItem[], type: ScoreDashboardMediaType): number {
  return type === "all" ? items.length : items.filter((item) => item.mediaType === type).length;
}

function itemSource(item: MediaItem): { filePath: string; score: number | null } {
  return { filePath: item.filePath, score: item.score };
}

function applyLocalChanges(items: readonly MediaItem[], changes: readonly ScoreDashboardScoreChange[]): void {
  const scores = new Map(changes.map((change) => [change.filePath, change.nextScore]));
  items.forEach((item) => {
    if (scores.has(item.filePath)) item.score = scores.get(item.filePath) ?? null;
  });
}

export function visibleScoreDashboardPaths(
  items: readonly MediaItem[],
  type: ScoreDashboardMediaType,
  showUnrated: boolean,
): string[] {
  return filterScoreDashboardItems(items, type)
    .filter((item) => showUnrated || item.score != null)
    .map((item) => item.filePath);
}

export function toggleScoreDashboardPathSelection(selectedPaths: Set<string>, path: string): boolean {
  if (selectedPaths.has(path)) {
    selectedPaths.delete(path);
    return false;
  }
  selectedPaths.add(path);
  return true;
}

export function renderScoreDashboard(
  container: HTMLElement,
  items: readonly MediaItem[],
  initialState: ScoreDashboardUiState,
  adapters: ScoreDashboardUiAdapters,
): void {
  const state: ScoreDashboardUiState = {
    type: TYPE_OPTIONS.some(([value]) => value === initialState.type) ? initialState.type : "all",
    scale: normalizeScoreDashboardScale(initialState.scale),
    showUnrated: initialState.showUnrated === true,
  };
  const selectedPaths = new Set<string>();
  let batchMode = false;
  let operationPending = false;
  let continuousScale = state.scale;
  let anchorFrame = 0;
  let anchorElement: HTMLElement | null = null;
  let anchorTop = 0;
  let saveTimer = 0;

  container.replaceChildren();
  const shell = create("section", "al-score-dashboard");
  container.appendChild(shell);

  const applyScale = (): void => {
    const metrics = scoreDashboardPosterMetrics(continuousScale);
    shell.dataset.labelLayout = metrics.labelLayout;
    shell.style.setProperty("--al-score-poster-width", `${metrics.posterWidth}px`);
    shell.style.setProperty("--al-score-poster-height", `${metrics.posterHeight}px`);
    shell.style.setProperty("--al-score-poster-gap", `${metrics.gap}px`);
    shell.style.setProperty("--al-score-lane-margin", `${metrics.verticalMargin}px`);
    shell.style.setProperty("--al-score-lane-min-height", `${metrics.laneMinHeight}px`);
  };

  const header = create("header", "al-score-dashboard-header");
  const copy = create("div", "al-score-dashboard-copy");
  copy.append(
    create("div", "al-score-dashboard-kicker", text.kicker),
    create("h1", "al-score-dashboard-title", text.title),
    create("p", "al-score-dashboard-description", text.description),
  );
  const summary = create("div", "al-score-dashboard-summary");
  header.append(copy, summary);

  const controls = create("div", "al-score-dashboard-controls");
  const typeTabs = create("nav", "al-score-dashboard-tabs");
  const actionGroup = create("div", "al-score-dashboard-action-group");
  const unratedButton = create("button", "al-score-tool-button");
  unratedButton.type = "button";
  const batchButton = create("button", "al-score-tool-button");
  batchButton.type = "button";
  actionGroup.append(unratedButton, batchButton);
  const zoom = create("label", "al-score-dashboard-zoom");
  const zoomLabel = create("span", "", text.zoom);
  const zoomInput = create("input");
  zoomInput.type = "range";
  zoomInput.min = String(SCORE_DASHBOARD_MIN_SCALE);
  zoomInput.max = String(SCORE_DASHBOARD_MAX_SCALE);
  zoomInput.step = "5";
  zoomInput.value = String(state.scale);
  const zoomValue = create("output", "", `${state.scale}%`);
  zoom.append(zoomLabel, zoomInput, zoomValue);
  controls.append(typeTabs, actionGroup, zoom);

  const batchBar = create("div", "al-score-batch-toolbar");
  const selectedCount = create("strong", "al-score-batch-count");
  const selectVisibleButton = create("button", "al-score-batch-secondary", text.selectVisible);
  selectVisibleButton.type = "button";
  const clearButton = create("button", "al-score-batch-secondary", text.clearSelection);
  clearButton.type = "button";
  const targetSelect = create("select", "al-score-batch-target");
  const targetPlaceholder = create("option", "", text.moveTo);
  targetPlaceholder.value = "";
  targetSelect.appendChild(targetPlaceholder);
  const unratedOption = create("option", "", text.unrated);
  unratedOption.value = "unrated";
  targetSelect.appendChild(unratedOption);
  scoreDashboardScores().forEach((score) => {
    const option = create("option", "", score.toFixed(1));
    option.value = score.toFixed(1);
    targetSelect.appendChild(option);
  });
  const shiftDown = create("button", "al-score-batch-shift", `− ${text.shiftDown}`);
  shiftDown.type = "button";
  const shiftUp = create("button", "al-score-batch-shift", `+ ${text.shiftUp}`);
  shiftUp.type = "button";
  batchBar.append(selectedCount, selectVisibleButton, clearButton, targetSelect, shiftDown, shiftUp);

  const board = create("div", "al-score-board");
  const posterCache = new Map<string, HTMLButtonElement>();
  shell.append(header, controls, batchBar, board);

  const emitState = () => adapters.onStateChange({ ...state });
  const scheduleStateSave = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      state.scale = Math.round(continuousScale);
      emitState();
    }, 150);
  };
  const updateScaleControls = () => {
    const rounded = Math.round(continuousScale);
    zoomInput.value = String(rounded);
    zoomValue.textContent = `${rounded}%`;
  };
  const selectedItems = (): MediaItem[] => items.filter((item) => selectedPaths.has(item.filePath));

  const setToolButton = (
    button: HTMLButtonElement,
    icon: string,
    label: string,
    badge: string | null,
  ): void => {
    button.replaceChildren();
    const iconElement = create("span", "al-score-tool-icon");
    setIcon(iconElement, icon);
    const labelElement = create("span", "al-score-tool-label", label);
    button.append(iconElement, labelElement);
    if (badge != null) button.appendChild(create("span", "al-score-tool-badge", badge));
  };

  const updatePosterSelection = (button: HTMLElement, selected: boolean): void => {
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-selected", String(selected));
    const check = button.querySelector<HTMLElement>(".al-score-poster-check");
    if (!check) return;
    check.replaceChildren();
    setIcon(check, selected ? "check" : "circle");
  };

  const refreshPosterSelections = (): void => {
    board.querySelectorAll<HTMLElement>(".al-score-poster").forEach((button) => {
      updatePosterSelection(button, selectedPaths.has(button.dataset.filePath ?? ""));
    });
  };

  const updateBatchControls = (): void => {
    shell.classList.toggle("is-batch-mode", batchMode);
    batchBar.classList.toggle("is-visible", batchMode);
    batchButton.classList.toggle("is-active", batchMode);
    batchButton.setAttribute("aria-pressed", String(batchMode));
    batchButton.title = batchMode ? text.finishBatch : text.batchSelect;
    batchButton.setAttribute("aria-label", batchButton.title);
    setToolButton(batchButton, batchMode ? "check" : "list-checks", batchMode ? text.finishBatchShort : text.batchShort, null);
    selectedCount.textContent = text.selected(selectedPaths.size);
    const disabled = operationPending || selectedPaths.size === 0;
    clearButton.disabled = disabled;
    targetSelect.disabled = disabled;
    shiftDown.disabled = disabled;
    shiftUp.disabled = disabled;
    selectVisibleButton.disabled = operationPending;
  };

  const updateUnratedControl = (count: number): void => {
    unratedButton.classList.toggle("is-active", state.showUnrated);
    unratedButton.setAttribute("aria-pressed", String(state.showUnrated));
    unratedButton.title = state.showUnrated ? text.hideUnrated : text.showUnrated;
    unratedButton.setAttribute("aria-label", text.unratedControlLabel(unratedButton.title, count));
    setToolButton(unratedButton, state.showUnrated ? "eye" : "eye-off", text.unrated, String(count));
  };

  const updateSummary = (): void => {
    const data = buildScoreDashboardData(items, state.type);
    summary.textContent = `${text.ratedSummary(data.rated, data.total)} · ${batchMode ? text.selectionHint : text.dragHint}`;
    updateUnratedControl(data.unrated.length);
  };

  const applyDroppedChange = (
    changes: readonly ScoreDashboardScoreChange[],
    poster: HTMLButtonElement,
    targetLane: HTMLElement,
  ): boolean => {
    const change = changes.length === 1 ? changes[0] : null;
    if (!change || change.filePath !== poster.dataset.filePath || poster.closest(".al-score-lane") === targetLane) {
      return false;
    }
    const targetTop = targetLane.getBoundingClientRect().top;
    const result = applyScoreDashboardDomChanges(container, changes);
    if (!result.applied) return false;
    updateSummary();
    container.scrollTop = preserveScoreDashboardAnchorScrollTop(
      container.scrollTop,
      targetTop,
      targetLane.getBoundingClientRect().top,
    );
    return true;
  };

  const performPlan = async (
    plan: ScoreDashboardMovePlan,
    onApplied?: ScoreDashboardAppliedHandler,
  ): Promise<void> => {
    if (operationPending) return;
    if (plan.blockedUnratedPaths.length) {
      adapters.showNotice(text.shiftBlockedUnrated(plan.blockedUnratedPaths.length));
      return;
    }
    if (!plan.changes.length) {
      adapters.showNotice(text.moveNoChange);
      return;
    }
    if (scoreDashboardPlanNeedsClampConfirmation(plan)) {
      const confirmed = await adapters.confirmClamp({
        lowCount: plan.clampedLowPaths.length,
        highCount: plan.clampedHighPaths.length,
      });
      if (!confirmed) return;
    }
    operationPending = true;
    updateBatchControls();
    try {
      await adapters.applyChanges(plan.changes);
      applyLocalChanges(items, plan.changes);
      selectedPaths.clear();
      const handled = onApplied?.(plan.changes) === true;
      if (!handled) update();
      adapters.showNotice(text.moveSuccess(plan.changes.length));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      adapters.showNotice(text.moveFailed(message));
    } finally {
      operationPending = false;
      updateBatchControls();
    }
  };

  const renderCover = (item: MediaItem): HTMLElement => {
    const cached = posterCache.get(item.filePath);
    if (cached) {
      cached.title = item.title;
      cached.dataset.mediaType = item.mediaType;
      cached.dataset.score = item.score == null ? "unrated" : item.score.toFixed(1);
      cached.draggable = !batchMode;
      cached.setAttribute("aria-label", text.posterAria(item.title, item.score == null ? text.unrated : item.score.toFixed(1)));
      updatePosterSelection(cached, selectedPaths.has(item.filePath));
      return cached;
    }

    const button = create("button", "al-score-poster");
    button.type = "button";
    button.title = item.title;
    button.dataset.filePath = item.filePath;
    button.dataset.mediaType = item.mediaType;
    button.dataset.score = item.score == null ? "unrated" : item.score.toFixed(1);
    button.draggable = !batchMode;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(selectedPaths.has(item.filePath)));
    button.setAttribute("aria-label", text.posterAria(item.title, item.score == null ? text.unrated : item.score.toFixed(1)));
    button.classList.toggle("is-selected", selectedPaths.has(item.filePath));
    const check = create("span", "al-score-poster-check");
    setIcon(check, selectedPaths.has(item.filePath) ? "check" : "circle");
    button.appendChild(check);
    button.addEventListener("click", () => {
      if (!batchMode) {
        void adapters.openFile(item.filePath);
        return;
      }
      const selected = toggleScoreDashboardPathSelection(selectedPaths, item.filePath);
      updatePosterSelection(button, selected);
      updateBatchControls();
    });
    button.addEventListener("dragstart", (event) => {
      if (batchMode || !event.dataTransfer) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(DRAG_DATA_TYPE, item.filePath);
      event.dataTransfer.setData("text/plain", item.filePath);
      button.classList.add("is-dragging");
    });
    button.addEventListener("dragend", () => button.classList.remove("is-dragging"));

    if (item.cover) {
      const image = create("img", "al-score-poster-image");
      image.alt = text.coverAlt(item.title);
      image.loading = "lazy";
      image.decoding = "async";
      image.draggable = false;
      image.src = item.coverSources?.src || item.cover;
      if (item.coverSources?.srcset) image.srcset = item.coverSources.srcset;
      image.addEventListener("error", () => {
        image.remove();
        const missing = create("span", "al-score-poster-missing");
        setIcon(missing, item.mediaType === "anime" ? "clapperboard" : "book-open");
        button.appendChild(missing);
      }, { once: true });
      button.appendChild(image);
    } else {
      const missing = create("span", "al-score-poster-missing");
      setIcon(missing, item.mediaType === "anime" ? "clapperboard" : "book-open");
      button.appendChild(missing);
    }
    posterCache.set(item.filePath, button);
    return button;
  };

  const renderLane = (
    score: number | null,
    laneItems: readonly MediaItem[],
    mountPosters = true,
  ): HTMLElement => {
    const lane = create("div", "al-score-lane");
    lane.dataset.score = score == null ? "unrated" : score.toFixed(1);
    lane.setAttribute("role", "listbox");
    lane.setAttribute("aria-label", score == null ? text.unrated : text.scoreLaneAria(score.toFixed(1)));
    lane.addEventListener("dragover", (event) => {
      if (batchMode || !event.dataTransfer?.types.includes(DRAG_DATA_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      lane.classList.add("is-drop-target");
    });
    lane.addEventListener("dragleave", (event) => {
      if (!lane.contains(event.relatedTarget as Node | null)) lane.classList.remove("is-drop-target");
    });
    lane.addEventListener("drop", (event) => {
      event.preventDefault();
      lane.classList.remove("is-drop-target");
      const path = event.dataTransfer?.getData(DRAG_DATA_TYPE) || "";
      const item = items.find((candidate) => candidate.filePath === path);
      const poster = Array.from(board.querySelectorAll<HTMLButtonElement>(".al-score-poster"))
        .find((candidate) => candidate.dataset.filePath === path);
      if (item && poster) {
        void performPlan(
          planScoreDashboardMove([itemSource(item)], score),
          (changes) => applyDroppedChange(changes, poster, lane),
        );
      }
    });

    const label = create("div", "al-score-lane-label", score == null ? "—" : score.toFixed(1));
    if (score != null) label.style.setProperty("--al-score-color", scoreColor(score));
    const posters = create("div", "al-score-lane-posters");
    if (mountPosters) {
      if (laneItems.length) laneItems.forEach((item) => posters.appendChild(renderCover(item)));
      else posters.appendChild(create("span", "al-score-lane-empty", text.emptyLane));
    }
    lane.append(label, posters);
    return lane;
  };

  const update = (): void => {
    const scrollTop = container.scrollTop;
    const data = buildScoreDashboardData(items, state.type);
    continuousScale = state.scale;
    applyScale();
    updateScaleControls();
    summary.textContent = `${text.ratedSummary(data.rated, data.total)} · ${batchMode ? text.selectionHint : text.dragHint}`;
    typeTabs.replaceChildren();
    TYPE_OPTIONS.forEach(([value, label]) => {
      const button = create("button", `al-score-dashboard-tab${state.type === value ? " is-active" : ""}`);
      button.type = "button";
      button.append(create("span", "", label), create("span", "al-score-dashboard-count", String(typeCount(items, value))));
      button.addEventListener("click", () => { state.type = value; selectedPaths.clear(); update(); emitState(); });
      typeTabs.appendChild(button);
    });

    updateUnratedControl(data.unrated.length);
    updateBatchControls();

    const laneMounts: Array<{ lane: HTMLElement; items: readonly MediaItem[] }> = [];
    const groupElements = data.groups.map((group) => {
      const groupElement = create("section", "al-score-group");
      groupElement.dataset.majorScore = String(group.major);
      const major = create("div", "al-score-major");
      major.style.setProperty("--al-score-color", scoreColor(group.major));
      major.append(
        create("strong", "al-score-major-number", String(group.major)),
        create("span", "al-score-major-count", `${group.itemCount} ${text.works}`),
      );
      const lanes = create("div", "al-score-group-lanes");
      group.lanes.forEach((scoreLane) => {
        const lane = renderLane(scoreLane.score, [], false);
        laneMounts.push({ lane, items: scoreLane.items });
        lanes.appendChild(lane);
      });
      groupElement.append(major, lanes);
      return groupElement;
    });
    if (state.showUnrated) {
      const groupElement = create("section", "al-score-group is-unrated");
      const major = create("div", "al-score-major");
      major.append(create("strong", "al-score-major-number", "—"), create("span", "al-score-major-count", `${data.unrated.length} ${text.works}`));
      const lanes = create("div", "al-score-group-lanes");
      const lane = renderLane(null, [], false);
      laneMounts.push({ lane, items: data.unrated });
      lanes.appendChild(lane);
      groupElement.append(major, lanes);
      groupElements.push(groupElement);
    }

    const movingPosters = [...posterCache.values()].filter((poster) => poster.isConnected);
    void animateLayoutChange(movingPosters, () => {
      board.replaceChildren(...groupElements);
      for (const { lane, items: laneItems } of laneMounts) {
        const posters = lane.querySelector<HTMLElement>(".al-score-lane-posters");
        if (!posters) continue;
        if (laneItems.length) laneItems.forEach((item) => posters.appendChild(renderCover(item)));
        else posters.appendChild(create("span", "al-score-lane-empty", text.emptyLane));
      }
    });
    container.scrollTop = scrollTop;
  };

  batchButton.addEventListener("click", () => {
    batchMode = !batchMode;
    if (!batchMode) selectedPaths.clear();
    board.querySelectorAll<HTMLButtonElement>(".al-score-poster").forEach((button) => {
      button.draggable = !batchMode;
    });
    refreshPosterSelections();
    updateBatchControls();
    updateSummary();
  });
  selectVisibleButton.addEventListener("click", () => {
    visibleScoreDashboardPaths(items, state.type, state.showUnrated).forEach((path) => selectedPaths.add(path));
    refreshPosterSelections();
    updateBatchControls();
  });
  clearButton.addEventListener("click", () => {
    selectedPaths.clear();
    refreshPosterSelections();
    updateBatchControls();
  });
  targetSelect.addEventListener("change", () => {
    const value = targetSelect.value;
    targetSelect.value = "";
    if (!value) return;
    const target: ScoreDashboardTargetScore = value === "unrated" ? null : Number(value);
    void performPlan(planScoreDashboardMove(selectedItems().map(itemSource), target));
  });
  shiftDown.addEventListener("click", () => void performPlan(planScoreDashboardShift(selectedItems().map(itemSource), -1)));
  shiftUp.addEventListener("click", () => void performPlan(planScoreDashboardShift(selectedItems().map(itemSource), 1)));
  unratedButton.addEventListener("click", () => { state.showUnrated = !state.showUnrated; selectedPaths.clear(); update(); emitState(); });
  zoomInput.addEventListener("input", () => {
    continuousScale = normalizeScoreDashboardScale(zoomInput.value);
    state.scale = continuousScale;
    updateScaleControls();
    applyScale();
  });
  zoomInput.addEventListener("change", emitState);
  board.addEventListener("wheel", (event) => {
    if (scoreDashboardWheelIntent(event) === "scroll") return;
    event.preventDefault();
    if (!anchorFrame) {
      const target = board.ownerDocument.elementFromPoint(event.clientX, event.clientY);
      anchorElement = target && board.contains(target) ? target.closest<HTMLElement>(".al-score-poster, .al-score-lane") : null;
      anchorTop = anchorElement?.getBoundingClientRect().top ?? event.clientY;
    }
    continuousScale = scoreDashboardScaleFromWheel(continuousScale, event.deltaY, SCORE_DASHBOARD_MIN_SCALE, SCORE_DASHBOARD_MAX_SCALE);
    state.scale = continuousScale;
    updateScaleControls();
    applyScale();
    scheduleStateSave();
    if (!anchorFrame) {
      anchorFrame = window.requestAnimationFrame(() => {
        anchorFrame = 0;
        const currentAnchor = anchorElement;
        anchorElement = null;
        if (currentAnchor?.isConnected) {
          container.scrollTop = preserveScoreDashboardAnchorScrollTop(container.scrollTop, anchorTop, currentAnchor.getBoundingClientRect().top);
        }
      });
    }
  }, { passive: false });
  update();
}
