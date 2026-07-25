import { ItemView, type WorkspaceLeaf } from "obsidian";
import { normalizeScoreDashboardScale, SCORE_DASHBOARD_DEFAULT_SCALE } from "./score-dashboard-model";
import { scoreDashboardText as text } from "./score-dashboard-text";
import { renderScoreDashboard, type ScoreDashboardUiState } from "./score-dashboard-ui";
import type { MediaItem } from "./types";

export const SCORE_DASHBOARD_VIEW_TYPE = "animelist-score-dashboard";

export interface ScoreDashboardPluginHost {
  collectMediaItems(): MediaItem[];
  openMediaFile(path: string): Promise<void>;
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

  constructor(leaf: WorkspaceLeaf, private readonly plugin: ScoreDashboardPluginHost) { super(leaf); }
  getViewType(): string { return SCORE_DASHBOARD_VIEW_TYPE; }
  getDisplayText(): string { return text.title; }
  getIcon(): string { return "table-properties"; }

  async onOpen(): Promise<void> { this.render(); }
  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.contentEl.empty();
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
    renderScoreDashboard(this.contentEl, this.plugin.collectMediaItems(), this.state, {
      openFile: (path) => this.plugin.openMediaFile(path),
      onStateChange: (state) => { this.state = state; },
    });
    window.requestAnimationFrame(() => { this.contentEl.scrollTop = scrollTop; });
  }
}
