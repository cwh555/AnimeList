import { ItemView, type WorkspaceLeaf } from "obsidian";
import { ScoreDashboardDragAutoScroller } from "./score-dashboard-drag-scroll";
import { renderScoreDashboardWithBatchDrag } from "./score-dashboard-batch-drag";
import { normalizeScoreDashboardScale, SCORE_DASHBOARD_DEFAULT_SCALE } from "./score-dashboard-model";
import type { ScoreDashboardScoreChange } from "./score-dashboard-move";
import type { ScoreDashboardClampSummary } from "./score-dashboard-operation-ui";
import { scoreDashboardText as text } from "./score-dashboard-text";
import type { ScoreDashboardUiState } from "./score-dashboard-ui";
import type { MediaItem } from "./types";

export const SCORE_DASHBOARD_VIEW_TYPE = "animelist-score-dashboard";

export interface ScoreDashboardPluginHost {
  collectMediaItems(): MediaItem[];
  openMediaFile(path: string): Promise<void>;
  applyScoreChanges(changes: readonly ScoreDashboardScoreChange[]): Promise<void>;
  confirmScoreClamp(summary: ScoreDashboardClampSummary): Promise<boolean>;
  showNotice(message: string): void;
}

interface PersistedState {
  type?: ScoreDashboardUiState["type"];
  scale?: number;
  showUnrated?: boolean;
  scrollTop?: number;
}

export class ScoreDashboardView extends ItemView {
  private state: ScoreDashboardUiState = { type: "all", scale: SCORE_DASHBOARD_DEFAULT_SCALE, showUnrated: false };
  private refreshTimer: number | null = null;
  private pendingScrollTop = 0;
  private dragScroller: ScoreDashboardDragAutoScroller | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: ScoreDashboardPluginHost) { super(leaf); }
  getViewType(): string { return SCORE_DASHBOARD_VIEW_TYPE; }
  getDisplayText(): string { return text.title; }
  getIcon(): string { return "table-properties"; }

  private readonly handleDragStart = (event: DragEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const poster = target.closest<HTMLButtonElement>(".al-score-poster");
    if (!poster?.draggable) return;
    this.stopDragScroll();
    this.dragScroller = new ScoreDashboardDragAutoScroller(this.contentEl);
    this.dragScroller.start();
  };

  private readonly handleDragOver = (event: DragEvent): void => {
    this.dragScroller?.update(event.clientY);
  };

  private readonly handleDragEnd = (): void => this.stopDragScroll();

  async onOpen(): Promise<void> {
    this.contentEl.addEventListener("dragstart", this.handleDragStart);
    this.contentEl.addEventListener("dragover", this.handleDragOver);
    this.contentEl.addEventListener("drop", this.handleDragEnd);
    this.contentEl.addEventListener("dragend", this.handleDragEnd);
    this.render();
  }
  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.contentEl.removeEventListener("dragstart", this.handleDragStart);
    this.contentEl.removeEventListener("dragover", this.handleDragOver);
    this.contentEl.removeEventListener("drop", this.handleDragEnd);
    this.contentEl.removeEventListener("dragend", this.handleDragEnd);
    this.stopDragScroll();
    this.contentEl.empty();
  }

  private stopDragScroll(): void {
    this.dragScroller?.stop();
    this.dragScroller = null;
  }

  getState(): PersistedState {
    return { ...this.state, scrollTop: this.contentEl.scrollTop };
  }

  async setState(state: PersistedState): Promise<void> {
    this.state = {
      type: state.type === "anime" || state.type === "manga" || state.type === "novel" ? state.type : "all",
      scale: normalizeScoreDashboardScale(state.scale),
      showUnrated: state.showUnrated === true,
    };
    this.pendingScrollTop = Math.max(0, Number(state.scrollTop) || 0);
    this.render();
  }

  scheduleRender(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => { this.refreshTimer = null; this.render(); }, 100);
  }

  private render(): void {
    const scrollTop = this.contentEl.scrollTop || this.pendingScrollTop;
    this.contentEl.addClass("animelist-score-dashboard-view");
    renderScoreDashboardWithBatchDrag(this.contentEl, this.plugin.collectMediaItems(), this.state, {
      openFile: (path) => this.plugin.openMediaFile(path),
      applyChanges: (changes) => this.plugin.applyScoreChanges(changes),
      confirmClamp: (summary) => this.plugin.confirmScoreClamp(summary),
      showNotice: (message) => this.plugin.showNotice(message),
      onStateChange: (state) => { this.state = state; },
    });
    window.requestAnimationFrame(() => { this.contentEl.scrollTop = scrollTop; });
  }
}
