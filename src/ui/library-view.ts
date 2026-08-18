import { ItemView, type WorkspaceLeaf } from "obsidian";
import { normalizeTimelineMaxStackDepth } from "../domain/timeline/scale";
import type { AnimeListSettings, LibrarySection, MediaItem, MediaType } from "../types";
import { uiText } from "../ui-text";
import type { LibraryRenderAdapters } from "./library-contracts";
import { installLibraryLayoutControl, type LibraryLayoutControl } from "./library-layout-controls";
import { TimelineUI } from "./timeline-renderer";
import type { WorkspaceMenuAction, WorkspacePageDefinition } from "./workspace-contracts";
import { renderAnimeListWorkspaceShell } from "./workspace-shell";

export const ANIMELIST_VIEW_TYPE = "animelist-library";
const DISPLAY_NAME = "AnimeList";

export interface AnimeListViewHost {
  settings: AnimeListSettings;
  saveSettings(): Promise<void>;
  renderLibrary(container: HTMLElement, items: MediaItem[], adapters?: LibraryRenderAdapters): void;
  collectMediaItems(): MediaItem[];
  updateUiState(state: AnimeListSettings["uiState"]): void;
  workspacePages(): WorkspacePageDefinition[];
  workspaceMenuActions(): WorkspaceMenuAction[];
  openMediaFile(path: string): Promise<void>;
  openAddModal(mediaType: MediaType): void;
  openEditModal(path: string): void;
  setFavorite(path: string, next: boolean): Promise<void>;
}

export class AnimeListView extends ItemView {
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly host: AnimeListViewHost) { super(leaf); }

  getViewType(): string { return ANIMELIST_VIEW_TYPE; }
  getDisplayText(): string { return DISPLAY_NAME; }
  getIcon(): string { return "library"; }
  async onOpen(): Promise<void> { await this.render(); }

  scheduleRender(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.render();
    }, 100);
  }

  async showSection(section: LibrarySection): Promise<void> {
    if (this.host.settings.uiState.section !== section) {
      this.host.settings.uiState.section = section;
      await this.host.saveSettings();
    }
    await this.render();
  }

  private corePages(items: MediaItem[]): WorkspacePageDefinition[] {
    return [{
      id: "library",
      label: uiText("library.title"),
      icon: "library",
      order: 10,
      render: (container) => {
        let layoutControl: LibraryLayoutControl | null = null;
        this.host.renderLibrary(container, items, {
          presentation: "workspace",
          initialState: this.host.settings.uiState,
          onStateChange: (state) => {
            const next = { ...this.host.settings.uiState, ...state } as AnimeListSettings["uiState"];
            this.host.updateUiState(next);
            layoutControl?.sync(next);
          },
          openFile: (path) => void this.host.openMediaFile(path),
          addItem: (mediaType) => this.host.openAddModal(mediaType),
          editItem: (path) => this.host.openEditModal(path),
          toggleFavorite: (path, next) => this.host.setFavorite(path, next),
        });
        layoutControl = installLibraryLayoutControl(container, {
          initialState: this.host.settings.uiState,
          onColumnsChange: (layoutColumns) => {
            const next = { ...this.host.settings.uiState, layoutColumns };
            this.host.updateUiState(next);
            layoutControl?.sync(next);
          },
        });
      },
    }, {
      id: "timeline",
      label: uiText("timeline.title"),
      icon: "clock-3",
      order: 20,
      render: (container) => {
        TimelineUI.render(container, items, {
          maxStackDepth: normalizeTimelineMaxStackDepth(this.host.settings.timelineMaxStackDepth),
          openFile: (path) => this.host.openMediaFile(path),
        });
      },
    }];
  }

  private async render(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("animelist-native-view");
    const items = this.host.collectMediaItems();
    const pages = [...this.corePages(items), ...this.host.workspacePages()];
    const result = renderAnimeListWorkspaceShell(this.contentEl, {
      pages,
      activeSection: this.host.settings.uiState.section,
      actions: this.host.workspaceMenuActions(),
      onSelect: (section) => this.showSection(section),
    });
    if (result.activePage.id !== this.host.settings.uiState.section) {
      this.host.settings.uiState.section = result.activePage.id;
      await this.host.saveSettings();
    }
    await result.activePage.render(result.page);
  }
}
