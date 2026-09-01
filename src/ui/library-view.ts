import { ItemView, type WorkspaceLeaf } from "obsidian";
import { normalizeTimelineMaxStackDepth } from "../domain/timeline/scale";
import type { AnimeListSettings, LibrarySection, MediaItem, MediaType } from "../types";
import { uiText } from "../ui-text";
import type { LibraryRenderAdapters } from "./library-contracts";
import { installLibraryLayoutControl, type LibraryLayoutControl } from "./library-layout-controls";
import { installLibraryWorkspaceLayout, renderLibraryWorkspaceActions } from "./library-workspace-layout";
import { renderTimelineWorkspace } from "./timeline-workspace-renderer";
import type { WorkspaceMenuAction, WorkspacePageDefinition } from "./workspace-contracts";
import { renderAnimeListWorkspaceShell } from "./workspace-shell";
import { captureScrollPosition } from "./viewport-anchor";
import { installCoverImageLoading } from "./cover-image-loading";

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
  private renderedSection: LibrarySection | null = null;
  private renderController: AbortController | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly host: AnimeListViewHost) { super(leaf); }

  getViewType(): string { return ANIMELIST_VIEW_TYPE; }
  getDisplayText(): string { return DISPLAY_NAME; }
  getIcon(): string { return "library"; }
  async onOpen(): Promise<void> { await this.render(); }
  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.renderController?.abort();
    this.renderController = null;
  }

  scheduleRender(): void {
    // Abort slow page work as soon as a fresher render is requested; the
    // debounce only delays starting the replacement render.
    this.renderController?.abort();
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.render();
    }, 100);
  }

  async showSection(section: LibrarySection): Promise<void> {
    // A direct navigation supersedes both queued metadata refreshes and any slow
    // page render that is still in flight. Do this before saveSettings() so an
    // old async page cannot win the race while navigation is being persisted.
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.renderController?.abort();
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
      render: (container, context) => {
        renderLibraryWorkspaceActions(context.pageActions, {
          currentType: () => this.host.settings.uiState.type,
          addItem: (mediaType) => this.host.openAddModal(mediaType),
        });
        let layoutControl: LibraryLayoutControl | null = null;
        const coverLoading = installCoverImageLoading(container, {
          selector: "img.al-cover",
          revealClass: "is-loaded",
        });
        context.signal.addEventListener("abort", () => coverLoading.disconnect(), { once: true });
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
          afterRender: () => coverLoading.sync(),
        });
        layoutControl = installLibraryLayoutControl(container, {
          initialState: this.host.settings.uiState,
          onColumnsChange: (layoutColumns) => {
            const next = { ...this.host.settings.uiState, layoutColumns };
            this.host.updateUiState(next);
            layoutControl?.sync(next);
          },
        });
        installLibraryWorkspaceLayout(container);
      },
    }, {
      id: "timeline",
      label: uiText("timeline.title"),
      icon: "clock-3",
      order: 20,
      render: (container) => {
        renderTimelineWorkspace(container, items, {
          maxStackDepth: normalizeTimelineMaxStackDepth(this.host.settings.timelineMaxStackDepth),
          openFile: (path) => this.host.openMediaFile(path),
        });
      },
    }];
  }

  private async render(): Promise<void> {
    // render() can also be entered directly (open/navigation), not only from the
    // debounce callback. Cancel any queued duplicate before starting this pass.
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.renderController?.abort();
    const controller = new AbortController();
    this.renderController = controller;

    try {
      this.contentEl.addClass("animelist-native-view");
      const requestedSection = this.host.settings.uiState.section;
      const samePageRefresh = this.renderedSection === requestedSection;
      const existingPage = samePageRefresh
        ? this.contentEl.querySelector<HTMLElement>(".al-workspace-page-body")
        : null;
      const scrollPosition = existingPage ? captureScrollPosition(existingPage) : null;

      const items = this.host.collectMediaItems();
      const pages = [...this.corePages(items), ...this.host.workspacePages()];
      const result = renderAnimeListWorkspaceShell(this.contentEl, {
        pages,
        activeSection: requestedSection,
        actions: this.host.workspaceMenuActions(),
        onSelect: (section) => this.showSection(section),
      });
      if (result.activePage.id !== this.host.settings.uiState.section) {
        this.host.settings.uiState.section = result.activePage.id;
        await this.host.saveSettings();
        if (controller.signal.aborted) return;
      }
      await result.activePage.render(result.page, {
        pageActions: result.pageActions,
        samePageRefresh,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (samePageRefresh && result.activePage.id === this.renderedSection) {
        // Restore once after the synchronous page reconciliation. Repeating the
        // restore across animation frames would fight a user who keeps scrolling.
        scrollPosition?.restore();
      }
      this.renderedSection = result.activePage.id;
    } finally {
      if (this.renderController === controller) this.renderController = null;
    }
  }
}
