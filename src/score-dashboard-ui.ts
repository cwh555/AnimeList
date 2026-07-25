import { setIcon } from "obsidian";
import {
  SCORE_DASHBOARD_MAX_SCALE,
  SCORE_DASHBOARD_MIN_SCALE,
  buildScoreDashboardData,
  normalizeScoreDashboardScale,
  scoreDashboardPosterMetrics,
} from "./score-dashboard-model";
import {
  preserveScoreDashboardAnchorScrollTop,
  scoreDashboardScaleFromWheel,
  scoreDashboardWheelIntent,
} from "./score-dashboard-gesture";
import { scoreDashboardText as text } from "./score-dashboard-text";
import type { MediaItem } from "./types";
import type { ScoreDashboardMediaType } from "./score-dashboard-model";

export interface ScoreDashboardUiState {
  type: ScoreDashboardMediaType;
  scale: number;
  showUnrated: boolean;
}

export interface ScoreDashboardUiAdapters {
  openFile(path: string): void | Promise<void>;
  onStateChange(state: ScoreDashboardUiState): void;
}

const TYPE_OPTIONS: Array<[ScoreDashboardMediaType, string]> = [
  ["all", text.all], ["anime", text.anime], ["manga", text.manga], ["novel", text.novel],
];

function create<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", label = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
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

function renderCover(item: MediaItem, openFile: ScoreDashboardUiAdapters["openFile"]): HTMLElement {
  const button = create("button", "al-score-poster");
  button.type = "button";
  button.title = item.title;
  button.dataset.filePath = item.filePath;
  button.dataset.mediaType = item.mediaType;
  button.setAttribute("role", "option");
  button.setAttribute("aria-selected", "false");
  button.setAttribute("aria-label", `${item.title}，${item.score == null ? text.unrated : item.score.toFixed(1)}`);
  button.addEventListener("click", () => void openFile(item.filePath));

  if (item.cover) {
    const image = create("img", "al-score-poster-image");
    image.alt = text.coverAlt(item.title);
    image.loading = "lazy";
    image.decoding = "async";
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
  return button;
}

function renderLane(score: number | null, items: readonly MediaItem[], openFile: ScoreDashboardUiAdapters["openFile"]): HTMLElement {
  const lane = create("div", "al-score-lane");
  lane.dataset.score = score == null ? "unrated" : score.toFixed(1);
  lane.setAttribute("role", "listbox");
  lane.setAttribute("aria-label", score == null ? text.unrated : `${score.toFixed(1)} 分`);

  const label = create("div", "al-score-lane-label", score == null ? "—" : score.toFixed(1));
  if (score != null) label.style.setProperty("--al-score-color", scoreColor(score));
  const posters = create("div", "al-score-lane-posters");
  if (items.length) items.forEach((item) => posters.appendChild(renderCover(item, openFile)));
  else posters.appendChild(create("span", "al-score-lane-empty", text.emptyLane));
  lane.append(label, posters);
  return lane;
}

function zoomAnchorAt(board: HTMLElement, clientX: number, clientY: number): HTMLElement | null {
  const target = board.ownerDocument.elementFromPoint(clientX, clientY);
  if (!target || !board.contains(target)) return null;
  return target.closest<HTMLElement>(".al-score-poster, .al-score-lane");
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
  const unratedButton = create("button", "al-score-dashboard-unrated");
  unratedButton.type = "button";
  controls.append(typeTabs, unratedButton, zoom);

  const board = create("div", "al-score-board");
  shell.append(header, controls, board);

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
  const update = () => {
    const data = buildScoreDashboardData(items, state.type);
    continuousScale = state.scale;
    applyScale();
    updateScaleControls();
    summary.textContent = text.ratedSummary(data.rated, data.total);
    typeTabs.replaceChildren();
    TYPE_OPTIONS.forEach(([value, label]) => {
      const button = create("button", `al-score-dashboard-tab${state.type === value ? " is-active" : ""}`);
      button.type = "button";
      button.append(create("span", "", label), create("span", "al-score-dashboard-count", String(typeCount(items, value))));
      button.addEventListener("click", () => { state.type = value; update(); emitState(); });
      typeTabs.appendChild(button);
    });

    unratedButton.textContent = state.showUnrated ? text.hideUnrated : `${text.unrated} ${data.unrated.length}`;
    unratedButton.classList.toggle("is-active", state.showUnrated);
    unratedButton.setAttribute("aria-pressed", String(state.showUnrated));

    board.replaceChildren();
    data.groups.forEach((group) => {
      const groupElement = create("section", "al-score-group");
      groupElement.dataset.majorScore = String(group.major);
      const major = create("div", "al-score-major");
      major.style.setProperty("--al-score-color", scoreColor(group.major));
      major.append(
        create("strong", "al-score-major-number", String(group.major)),
        create("span", "al-score-major-count", `${group.itemCount} ${text.works}`),
      );
      const lanes = create("div", "al-score-group-lanes");
      group.lanes.forEach((lane) => lanes.appendChild(renderLane(lane.score, lane.items, adapters.openFile)));
      groupElement.append(major, lanes);
      board.appendChild(groupElement);
    });
    if (state.showUnrated) {
      const groupElement = create("section", "al-score-group is-unrated");
      const major = create("div", "al-score-major");
      major.append(create("strong", "al-score-major-number", "—"), create("span", "al-score-major-count", `${data.unrated.length} ${text.works}`));
      const lanes = create("div", "al-score-group-lanes");
      lanes.appendChild(renderLane(null, data.unrated, adapters.openFile));
      groupElement.append(major, lanes);
      board.appendChild(groupElement);
    }
  };

  unratedButton.addEventListener("click", () => { state.showUnrated = !state.showUnrated; update(); emitState(); });
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
      anchorElement = zoomAnchorAt(board, event.clientX, event.clientY);
      anchorTop = anchorElement?.getBoundingClientRect().top ?? event.clientY;
    }

    continuousScale = scoreDashboardScaleFromWheel(
      continuousScale,
      event.deltaY,
      SCORE_DASHBOARD_MIN_SCALE,
      SCORE_DASHBOARD_MAX_SCALE,
    );
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
          container.scrollTop = preserveScoreDashboardAnchorScrollTop(
            container.scrollTop,
            anchorTop,
            currentAnchor.getBoundingClientRect().top,
          );
        }
      });
    }
  }, { passive: false });
  update();
}
