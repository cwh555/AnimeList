import { Modal } from "obsidian";
import type AnimeListPlugin from "./main";
import { TimelineUI } from "./legacy";
import { expandTimelineEntries } from "./novel-progress";
import { defaultProgressUnit } from "./progress-units";
import {
  centerLatestTimelineAxis,
  layoutDefaultTimelinePoints,
  timelineEntryCopy,
} from "./timeline-corrections";
import type { MediaItem } from "./types";
import { uiText } from "./ui-text";

const CARD_WIDTH = 120;
const CARD_HEIGHT = 146;
const CARD_GAP_X = 16;
const CARD_GAP_Y = 18;
const STEM_GAP = 44;
const SCENE_PADDING_Y = 56;
const SIDE_PADDING = 170;

interface TimelineCopyTarget {
  title: string;
  label: string;
}

function dateStart(value: unknown): number {
  const text = typeof value === "string" ? value.trim() : "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return 0;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getTime();
}

function formatDate(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sceneScale(scene: HTMLElement): number {
  const match = /scale\(([-\d.]+)\)/.exec(scene.style.transform);
  const value = match ? Number(match[1]) : 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function timelineCopyTargets(items: readonly MediaItem[]): Map<string, TimelineCopyTarget[]> {
  const targets = new Map<string, TimelineCopyTarget[]>();
  for (const item of expandTimelineEntries([...items])) {
    if (!item.volumeLabel) continue;
    const unit = defaultProgressUnit(item.mediaType, item.unit);
    if (unit === "episode") continue;
    const completedTime = dateStart(item.completedAt);
    if (!completedTime) continue;
    const date = formatDate(completedTime);
    const originalCardTitle = uiText("timeline.cardTitle", {
      title: item.title,
      date,
    });
    const copy = timelineEntryCopy(
      item.seriesTitle || item.title,
      item.volumeLabel,
      unit,
    );
    const queue = targets.get(originalCardTitle) ?? [];
    queue.push({
      title: uiText("timeline.cardTitle", { title: copy.title, date }),
      label: copy.label,
    });
    targets.set(originalCardTitle, queue);
  }
  return targets;
}

function correctTimelineEntryCopy(root: HTMLElement, items: readonly MediaItem[]): void {
  const targets = timelineCopyTargets(items);
  for (const card of root.querySelectorAll<HTMLElement>(".al-timeline-card")) {
    const queue = targets.get(card.title);
    const target = queue?.shift();
    if (!target) continue;
    const label = card.querySelector<HTMLElement>(".al-timeline-volume-label");
    if (label) label.textContent = target.label;
    card.title = target.title;
  }
}

function createDateLink(scene: HTMLElement, anchorX: number, cardX: number, axisY: number): void {
  const distance = Math.abs(cardX - anchorX);
  if (distance < 0.5) return;
  const link = scene.createDiv({ cls: "al-timeline-axis al-timeline-date-link" });
  link.style.left = `${Math.min(anchorX, cardX)}px`;
  link.style.top = `${axisY}px`;
  link.style.width = `${distance}px`;
}

function applyDefaultTimelineLayout(
  root: HTMLElement,
  maxStackDepth: number,
): boolean {
  const viewport = root.querySelector<HTMLElement>(".al-timeline-viewport");
  const scene = root.querySelector<HTMLElement>(".al-timeline-scene");
  const axis = root.querySelector<HTMLElement>(".al-timeline-axis:not(.al-timeline-date-link)");
  if (!viewport || !scene || !axis) return false;

  scene.querySelectorAll(".al-timeline-date-link").forEach((element) => element.remove());
  const cards = [...scene.querySelectorAll<HTMLElement>(".al-timeline-card")];
  const stems = [...scene.querySelectorAll<HTMLElement>(".al-timeline-stem")];
  if (!cards.length || cards.length !== stems.length) return false;

  const anchors = cards.map((card) => {
    const stored = Number(card.dataset.timelineAnchorX);
    if (Number.isFinite(stored)) return stored;
    return Number.parseFloat(card.style.left) + CARD_WIDTH / 2;
  });
  const placements = layoutDefaultTimelinePoints(
    anchors,
    CARD_WIDTH + CARD_GAP_X,
    maxStackDepth,
  );
  const laneCount = Math.max(1, ...placements.map((placement) => placement.lane + 1));
  const aboveLaneCount = Math.ceil(laneCount / 2);
  const belowLaneCount = Math.floor(laneCount / 2);
  const axisY = SCENE_PADDING_Y + STEM_GAP
    + aboveLaneCount * (CARD_HEIGHT + CARD_GAP_Y) - CARD_GAP_Y;
  const sceneHeight = axisY + SCENE_PADDING_Y
    + (belowLaneCount > 0
      ? STEM_GAP + belowLaneCount * (CARD_HEIGHT + CARD_GAP_Y) - CARD_GAP_Y
      : 0);

  axis.style.top = `${axisY}px`;
  scene.querySelectorAll<HTMLElement>(".al-timeline-tick").forEach((tick) => {
    tick.style.top = `${axisY - 7}px`;
  });
  scene.querySelectorAll<HTMLElement>(".al-timeline-day-marker").forEach((marker) => {
    marker.style.top = `${axisY - 5}px`;
  });

  placements.forEach((placement, index) => {
    const card = cards[index];
    const stem = stems[index];
    const level = Math.floor(placement.lane / 2);
    const aboveAxis = placement.lane % 2 === 0;
    const cardY = aboveAxis
      ? axisY - STEM_GAP - CARD_HEIGHT - level * (CARD_HEIGHT + CARD_GAP_Y)
      : axisY + STEM_GAP + level * (CARD_HEIGHT + CARD_GAP_Y);
    const stemStart = aboveAxis ? cardY + CARD_HEIGHT : axisY;
    const stemEnd = aboveAxis ? axisY : cardY;

    card.dataset.timelineAnchorX = String(placement.anchorX);
    card.dataset.timelineLane = String(placement.lane);
    card.style.left = `${placement.x - CARD_WIDTH / 2}px`;
    card.style.top = `${cardY}px`;
    stem.style.left = `${placement.x}px`;
    stem.style.top = `${stemStart}px`;
    stem.style.height = `${Math.max(1, stemEnd - stemStart)}px`;
    createDateLink(scene, placement.anchorX, placement.x, axisY);
  });

  const maximumCardX = Math.max(...placements.map((placement) => placement.x));
  const currentWidth = Number.parseFloat(scene.style.width) || 0;
  scene.style.width = `${Math.max(currentWidth, maximumCardX + SIDE_PADDING)}px`;
  scene.style.height = `${sceneHeight}px`;

  const scale = sceneScale(scene);
  const latestCardX = placements[placements.length - 1].x;
  const pan = centerLatestTimelineAxis(
    viewport.clientWidth,
    viewport.clientHeight,
    latestCardX,
    axisY,
    scale,
  );
  scene.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;
  return true;
}

class CorrectedTimelineModal extends Modal {
  private observer: MutationObserver | null = null;
  private pendingDefaultLayout = true;
  private correctionTimer: number | null = null;

  constructor(
    private readonly plugin: AnimeListPlugin,
    private readonly items: MediaItem[],
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-timeline-modal");
    this.contentEl.replaceChildren();
    TimelineUI.render(this.contentEl, this.items, {
      maxStackDepth: this.plugin.settings.timelineMaxStackDepth,
      openFile: async (path: string) => {
        this.close();
        await this.plugin.app.workspace.openLinkText(path, "", false);
      },
    });

    this.observer = new MutationObserver(() => this.refreshCorrections());
    this.observer.observe(this.contentEl, { childList: true, subtree: true });
    this.refreshCorrections();
  }

  onClose(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.correctionTimer !== null) window.clearTimeout(this.correctionTimer);
    this.correctionTimer = null;
    this.contentEl.empty();
  }

  private refreshCorrections(): void {
    this.wireControls();
    correctTimelineEntryCopy(this.contentEl, this.items);
    if (!this.pendingDefaultLayout || this.correctionTimer !== null) return;
    this.correctionTimer = window.setTimeout(() => {
      this.correctionTimer = null;
      if (!this.pendingDefaultLayout) return;
      this.pendingDefaultLayout = false;
      correctTimelineEntryCopy(this.contentEl, this.items);
      applyDefaultTimelineLayout(
        this.contentEl,
        this.plugin.settings.timelineMaxStackDepth,
      );
    }, 0);
  }

  private wireControls(): void {
    const defaultButtons = [
      ...this.contentEl.querySelectorAll<HTMLElement>(".al-timeline-type-filter"),
      ...this.contentEl.querySelectorAll<HTMLElement>(`button[aria-label="${uiText("timeline.reset")}"]`),
    ];
    for (const button of defaultButtons) {
      if (button.dataset.timelineCorrectionWired === "default") continue;
      button.dataset.timelineCorrectionWired = "default";
      button.addEventListener("click", () => {
        this.pendingDefaultLayout = true;
      }, { capture: true });
    }

    const manualLabels = [
      uiText("timeline.zoomOut"),
      uiText("timeline.zoomIn"),
      uiText("timeline.scaleOut"),
      uiText("timeline.scaleIn"),
      uiText("timeline.fit"),
    ];
    for (const label of manualLabels) {
      for (const button of this.contentEl.querySelectorAll<HTMLElement>(`button[aria-label="${label}"]`)) {
        if (button.dataset.timelineCorrectionWired === "manual") continue;
        button.dataset.timelineCorrectionWired = "manual";
        button.addEventListener("click", () => {
          this.pendingDefaultLayout = false;
        }, { capture: true });
      }
    }

    const viewport = this.contentEl.querySelector<HTMLElement>(".al-timeline-viewport");
    if (viewport && viewport.dataset.timelineCorrectionWheelWired !== "true") {
      viewport.dataset.timelineCorrectionWheelWired = "true";
      viewport.addEventListener("wheel", (event) => {
        if (event.ctrlKey || event.metaKey) this.pendingDefaultLayout = false;
      }, { capture: true, passive: true });
    }
  }
}

export function installTimelineCorrections(plugin: AnimeListPlugin): void {
  plugin.openTimeline = async (): Promise<void> => {
    await plugin.initializeLibrary(false);
    new CorrectedTimelineModal(plugin, plugin.collectMediaItems()).open();
  };
}

export const timelineCorrectionTest = {
  applyDefaultTimelineLayout,
  correctTimelineEntryCopy,
};
