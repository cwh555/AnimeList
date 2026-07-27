import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { AnimeListPluginHost } from "../app/plugin-host";
import { AnimeListUI } from "../compat/library-ui";
import type { AnimeListSettings, LibrarySection, MediaType } from "../types";
import { normalizeStatusFilter } from "../media-status";
import type { LibraryRenderAdapters, LibraryRenderState } from "../app/feature-registry";

export const LIBRARY_VIEW_TYPE = "animelist-library";

export interface LibraryViewHost extends AnimeListPluginHost {
  readonly manifest: { readonly name: string };
  updateUiState(state: AnimeListSettings["uiState"]): void;
}

export class AnimeListView extends ItemView {
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LibraryViewHost) {
    super(leaf);
  }

  getViewType(): string {
    return LIBRARY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.plugin.manifest.name;
  }

  getIcon(): string {
    return "library";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  scheduleRender(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.render();
    }, 100);
  }

  async showSection(section: LibrarySection): Promise<void> {
    this.plugin.settings.uiState.section = section;
    await this.plugin.saveSettings();
    await this.render();
  }

  private async render(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("animelist-native-view");
    const items = this.plugin.collectMediaItems();

    const adapters: LibraryRenderAdapters = {
      features: this.plugin.features,
      initialState: this.plugin.settings.uiState,
      onStateChange: (state: LibraryRenderState) => this.plugin.updateUiState({
        ...this.plugin.settings.uiState,
        type: state.type,
        status: normalizeStatusFilter(state.status),
        genre: state.genre,
        sort: state.sort,
        view: state.view,
      }),
      openFile: (path: string) => void this.plugin.openMediaFile(path),
      addItem: (mediaType: MediaType) => this.plugin.openAddModal(mediaType),
      editItem: (path: string) => this.plugin.openEditModal(path),
      toggleFavorite: async (path: string, next: boolean) => {
        await this.plugin.setFavorite(path, next);
        this.scheduleRender();
      },
      openTimeline: () => void this.plugin.openTimeline(),
    };
    AnimeListUI.renderLibrary(this.contentEl, items, adapters);
  }
}
