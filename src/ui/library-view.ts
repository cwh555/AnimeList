import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { AnimeListSettings, LibrarySection, MediaItem, MediaType } from "../types";
import type { LibraryRenderAdapters } from "./library-contracts";

export const ANIMELIST_VIEW_TYPE = "animelist-library";
const DISPLAY_NAME = "AnimeList";

export interface AnimeListViewHost {
  settings: AnimeListSettings;
  saveSettings(): Promise<void>;
  renderLibrary(container: HTMLElement, items: MediaItem[], adapters?: LibraryRenderAdapters): void;
  collectMediaItems(): MediaItem[];
  updateUiState(state: AnimeListSettings["uiState"]): void;
  openMediaFile(path: string): Promise<void>;
  openAddModal(mediaType: MediaType): void;
  openEditModal(path: string): void;
  setFavorite(path: string, next: boolean): Promise<void>;
  openTimeline(): Promise<void>;
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
    this.host.settings.uiState.section = section;
    await this.host.saveSettings();
    await this.render();
  }

  private async render(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("animelist-native-view");
    this.host.renderLibrary(this.contentEl, this.host.collectMediaItems(), {
      initialState: this.host.settings.uiState,
      onStateChange: (state) => this.host.updateUiState({ ...this.host.settings.uiState, ...state } as AnimeListSettings["uiState"]),
      openFile: (path) => void this.host.openMediaFile(path),
      addItem: (mediaType) => this.host.openAddModal(mediaType),
      editItem: (path) => this.host.openEditModal(path),
      toggleFavorite: async (path, next) => {
        await this.host.setFavorite(path, next);
        this.scheduleRender();
      },
      openTimeline: () => void this.host.openTimeline(),
    });
  }
}
