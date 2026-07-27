import type { SettingDefinition, TFile } from "obsidian";
import type { LibraryUiState } from "../domain/settings-types";
import type {
  ExternalMediaResult,
  MediaItem,
  MediaNoteForm,
  MediaType,
  SerialProgressEntry,
} from "../domain/media-types";


export interface SettingsSection {
  readonly heading?: string;
  readonly description?: string;
  readonly definitions: SettingDefinition[];
}

export interface SettingsContributionContext {
  readonly refresh: () => void;
}

export interface SettingsContribution {
  readonly id: string;
  readonly order?: number;
  sections(
    context: SettingsContributionContext,
  ): SettingsSection | SettingsSection[];
}

export interface LibraryRenderState {
  type: LibraryUiState["type"];
  status: string;
  genre: string;
  query: string;
  sort: string;
  view: LibraryUiState["view"];
}

export interface LibraryRenderAdapters {
  readonly features?: FeatureRegistry;
  initialState?: Partial<LibraryRenderState>;
  initialView?: string;
  openFile?: (path: string) => void;
  addItem?: (mediaType: MediaType) => void;
  editItem?: (path: string) => void;
  toggleFavorite?: (path: string, next: boolean) => Promise<void> | void;
  onStateChange?: (state: LibraryRenderState) => void;
  openTimeline?: () => void;
}

export interface LibraryToolbarContext {
  actions: HTMLElement;
  addButton: HTMLButtonElement | null;
  items: MediaItem[];
  adapters: LibraryRenderAdapters;
}

export interface LibraryCardContext {
  card: HTMLElement;
  item: MediaItem;
  adapters: LibraryRenderAdapters;
}

export interface LibraryAfterRenderContext {
  container: HTMLElement;
  items: MediaItem[];
  adapters: LibraryRenderAdapters;
  state: LibraryRenderState;
}

export interface LibraryContribution {
  readonly id: string;
  readonly order?: number;
  enrichItem?(item: MediaItem): MediaItem;
  statusFilters?(mediaType: string): Array<[string, string]>;
  matchesStatusFilter?(item: MediaItem, filter: string): boolean | undefined;
  renderToolbarAction?(context: LibraryToolbarContext): void;
  decorateCard?(context: LibraryCardContext): void;
  afterRender?(context: LibraryAfterRenderContext): void;
}

export interface MediaFormFields {
  readonly form: HTMLElement;
  readonly title: HTMLInputElement;
  readonly status: HTMLSelectElement;
  readonly releaseStatus: HTMLSelectElement | null;
  readonly score: HTMLInputElement;
  readonly startedAt: HTMLInputElement;
  readonly completedAt: HTMLInputElement;
  readonly progress: HTMLInputElement;
  readonly total: HTMLInputElement | null;
  readonly unit: HTMLSelectElement | null;
  readonly genres: HTMLInputElement;
  readonly template: HTMLSelectElement | null;
  readonly favorite: HTMLInputElement;
}

export interface MediaFormContext {
  readonly mode: "add" | "edit";
  readonly mediaType: MediaType;
  readonly container: HTMLElement;
  readonly fields: MediaFormFields;
  readonly frontmatter: Record<string, unknown>;
  readonly result: ExternalMediaResult | null;
  readonly file: TFile | null;
  readonly extensions: Map<string, unknown>;
}

export interface MediaFormContribution {
  readonly id: string;
  readonly order?: number;
  render?(context: MediaFormContext): void | Promise<void>;
  validate?(context: MediaFormContext): void | Promise<void>;
  collect?(context: MediaFormContext, form: MediaNoteForm): void;
  mutateFrontmatter?(
    context: MediaFormContext,
    frontmatter: Record<string, unknown>,
    form: MediaNoteForm,
  ): void;
  afterCreate?(context: MediaFormContext, file: TFile, form: MediaNoteForm): void | Promise<void>;
}

export interface AddMediaModalContext {
  readonly modal: {
    readonly contentEl: HTMLElement;
    mediaType: MediaType;
    query: string;
    results: ExternalMediaResult[];
    warnings: string[];
    renderSearch(): void;
    renderDetails(result: ExternalMediaResult): Promise<void>;
    createResultRow(result: ExternalMediaResult): HTMLElement;
  };
}

export interface AddMediaContribution {
  readonly id: string;
  readonly order?: number;
  afterSearchRender?(context: AddMediaModalContext): void;
  beforeSearch?(context: AddMediaModalContext): void;
  afterDetailsRender?(context: AddMediaModalContext, result: ExternalMediaResult): void | Promise<void>;
}


export interface ExternalSearchContext {
  readonly mediaType: MediaType;
  readonly query: string;
}

export interface ExternalSearchContribution {
  readonly id: string;
  readonly order?: number;
  search(
    context: ExternalSearchContext,
  ): Promise<{ results: ExternalMediaResult[]; warnings: string[] } | null>;
}

export interface FavoriteActionContext {
  readonly path: string;
  readonly next: boolean;
}

export interface FavoriteActionContribution {
  readonly id: string;
  readonly order?: number;
  handle(context: FavoriteActionContext): Promise<boolean>;
}

export interface DetailRenderContext {
  readonly container: HTMLElement;
  readonly sourcePath: string;
  readonly frontmatter: Record<string, unknown>;
}

export interface DetailContribution {
  readonly id: string;
  readonly order?: number;
  render(context: DetailRenderContext): void;
}

export interface SerialEntryRowContext {
  readonly form: MediaFormContext;
  readonly row: HTMLElement;
  readonly entry: SerialProgressEntry;
  readonly index: number;
  readonly refresh: () => void;
}

export interface SerialEntryContribution {
  readonly id: string;
  readonly order?: number;
  decorateRow(context: SerialEntryRowContext): void | Promise<void>;
}

function byOrder<T extends { readonly id: string; readonly order?: number }>(left: T, right: T): number {
  const order = (left.order ?? 0) - (right.order ?? 0);
  return order || left.id.localeCompare(right.id);
}

function ordered<T extends { readonly id: string; readonly order?: number }>(
  contributions: Map<string, T>,
): T[] {
  return [...contributions.values()].sort(byOrder);
}

export class FeatureRegistry {
  private readonly library = new Map<string, LibraryContribution>();
  private readonly forms = new Map<string, MediaFormContribution>();
  private readonly addMedia = new Map<string, AddMediaContribution>();
  private readonly favorite = new Map<string, FavoriteActionContribution>();
  private readonly search = new Map<string, ExternalSearchContribution>();
  private readonly detail = new Map<string, DetailContribution>();
  private readonly serialEntries = new Map<string, SerialEntryContribution>();
  private readonly settings = new Map<string, SettingsContribution>();

  registerLibrary(contribution: LibraryContribution): void {
    this.library.set(contribution.id, contribution);
  }

  registerMediaForm(contribution: MediaFormContribution): void {
    this.forms.set(contribution.id, contribution);
  }

  registerAddMedia(contribution: AddMediaContribution): void {
    this.addMedia.set(contribution.id, contribution);
  }

  registerFavoriteAction(contribution: FavoriteActionContribution): void {
    this.favorite.set(contribution.id, contribution);
  }

  registerExternalSearch(contribution: ExternalSearchContribution): void {
    this.search.set(contribution.id, contribution);
  }

  registerDetail(contribution: DetailContribution): void {
    this.detail.set(contribution.id, contribution);
  }

  registerSerialEntry(contribution: SerialEntryContribution): void {
    this.serialEntries.set(contribution.id, contribution);
  }

  registerSettings(contribution: SettingsContribution): void {
    this.settings.set(contribution.id, contribution);
  }

  enrichLibraryItems(items: MediaItem[]): MediaItem[] {
    return items.map((item) => {
      let enriched = item;
      for (const contribution of ordered(this.library)) {
        enriched = contribution.enrichItem?.(enriched) ?? enriched;
      }
      return enriched;
    });
  }

  libraryStatusFilters(mediaType: string): Array<[string, string]> {
    return ordered(this.library).flatMap((contribution) => (
      contribution.statusFilters?.(mediaType) ?? []
    ));
  }

  matchesLibraryStatus(item: MediaItem, filter: string): boolean | undefined {
    for (const contribution of ordered(this.library)) {
      const match = contribution.matchesStatusFilter?.(item, filter);
      if (typeof match === "boolean") return match;
    }
    return undefined;
  }

  renderLibraryToolbar(context: LibraryToolbarContext): void {
    for (const contribution of ordered(this.library)) contribution.renderToolbarAction?.(context);
  }

  decorateLibraryCard(context: LibraryCardContext): void {
    for (const contribution of ordered(this.library)) contribution.decorateCard?.(context);
  }

  afterLibraryRender(context: LibraryAfterRenderContext): void {
    for (const contribution of ordered(this.library)) contribution.afterRender?.(context);
  }

  mediaFormContributions(): MediaFormContribution[] {
    return ordered(this.forms);
  }

  async renderMediaForm(context: MediaFormContext): Promise<void> {
    for (const contribution of this.mediaFormContributions()) await contribution.render?.(context);
  }

  async validateMediaForm(context: MediaFormContext): Promise<void> {
    for (const contribution of this.mediaFormContributions()) await contribution.validate?.(context);
  }

  collectMediaForm(context: MediaFormContext, form: MediaNoteForm): void {
    for (const contribution of this.mediaFormContributions()) contribution.collect?.(context, form);
  }

  mutateMediaFormFrontmatter(
    context: MediaFormContext,
    frontmatter: Record<string, unknown>,
    form: MediaNoteForm,
  ): void {
    for (const contribution of this.mediaFormContributions()) {
      contribution.mutateFrontmatter?.(context, frontmatter, form);
    }
  }

  async afterMediaCreate(
    context: MediaFormContext,
    file: TFile,
    form: MediaNoteForm,
  ): Promise<void> {
    for (const contribution of this.mediaFormContributions()) {
      await contribution.afterCreate?.(context, file, form);
    }
  }

  afterAddSearchRender(context: AddMediaModalContext): void {
    for (const contribution of ordered(this.addMedia)) contribution.afterSearchRender?.(context);
  }

  beforeAddSearch(context: AddMediaModalContext): void {
    for (const contribution of ordered(this.addMedia)) contribution.beforeSearch?.(context);
  }

  async afterAddDetailsRender(
    context: AddMediaModalContext,
    result: ExternalMediaResult,
  ): Promise<void> {
    for (const contribution of ordered(this.addMedia)) {
      await contribution.afterDetailsRender?.(context, result);
    }
  }

  async searchExternal(
    context: ExternalSearchContext,
  ): Promise<{ results: ExternalMediaResult[]; warnings: string[] } | null> {
    for (const contribution of ordered(this.search)) {
      const response = await contribution.search(context);
      if (response) return response;
    }
    return null;
  }

  async handleFavorite(context: FavoriteActionContext): Promise<boolean> {
    for (const contribution of ordered(this.favorite)) {
      if (await contribution.handle(context)) return true;
    }
    return false;
  }

  renderDetails(context: DetailRenderContext): void {
    for (const contribution of ordered(this.detail)) contribution.render(context);
  }

  async decorateSerialEntry(context: SerialEntryRowContext): Promise<void> {
    for (const contribution of ordered(this.serialEntries)) {
      await contribution.decorateRow(context);
    }
  }

  settingsSections(context: SettingsContributionContext): SettingsSection[] {
    return ordered(this.settings).flatMap((contribution) => contribution.sections(context));
  }
}
