import type { Plugin, SettingDefinition, TFile } from "obsidian";
import type { SettingsPageId } from "./settings-layout";
import type {
  AnimeListSettings,
  CoverSources,
  ExternalMediaResult,
  ExternalMediaSearchPage,
  MediaItem,
  MediaNoteForm,
  MediaType,
} from "../types";
import type { MediaCoverAssetInput } from "../domain/manual-media";
import type {
  LibraryRenderAdapters,
  LibraryRenderContext,
} from "../ui/library-contracts";
import type {
  MediaFormContext,
  MediaFormSubmitContext,
} from "../ui/media-form-contracts";
import type { SearchRenderContext } from "../ui/search-contracts";
import type { WorkspaceMenuAction, WorkspacePageDefinition } from "../ui/workspace-contracts";
import type { LibrarySection } from "../domain/settings-types";

export interface FeatureSettingsSection {
  page?: SettingsPageId;
  heading?: string;
  description?: string;
  definitions: SettingDefinition[];
}

export interface AnimeListFeatureHost extends Pick<
  Plugin,
  "app" | "register" | "registerDomEvent" | "registerView" | "addCommand" | "registerEvent" | "registerMarkdownCodeBlockProcessor"
> {
  settings: AnimeListSettings;
  saveSettings(): Promise<void>;
  refreshViews(): void;
  ensureFolder(path: string): Promise<void>;
  uniqueFilePath(folder: string, baseName: string, extension: string): Promise<string>;
  getImageThumbnailSources(file: TFile): CoverSources | undefined;
  getScanFolders(): string[];
  collectMediaItems(source?: string): MediaItem[];
  resolveMediaCoverPath(value: unknown, sourcePath: string): string;
  openMediaFile(path: string): Promise<void>;
  openLibrarySection(section: LibrarySection): Promise<void>;
  updateMediaNote(file: TFile, mediaType: MediaType, form: MediaNoteForm): Promise<void>;
  createMediaNote(result: ExternalMediaResult, form: MediaNoteForm, coverAsset?: MediaCoverAssetInput | null): Promise<TFile>;
  downloadCover(result: ExternalMediaResult): Promise<string>;
  releaseDownloadedCover(path: string): void;
  searchExternalPage(mediaType: MediaType, query: string, page: number): Promise<ExternalMediaSearchPage>;
  enrichExternalMedia(result: ExternalMediaResult): Promise<ExternalMediaResult>;
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  setFavoriteDirect(path: string, next: boolean): Promise<void>;
  updateSpecialLabelState(path: string, favorite: boolean, labels: string[]): Promise<void>;
}

export interface FavoriteActionContext<Host extends AnimeListFeatureHost> {
  host: Host;
  path: string;
  next: boolean;
}

export interface DetailRenderContext<Host extends AnimeListFeatureHost> {
  host: Host;
  container: HTMLElement;
  sourcePath: string;
  frontmatter: Record<string, unknown>;
}

export interface LifecycleContribution<Host extends AnimeListFeatureHost> {
  readonly kind: "lifecycle";
  activate(host: Host): void | Promise<void>;
}

export interface MediaItemContribution<Host extends AnimeListFeatureHost> {
  readonly kind: "media-item";
  decorate(item: MediaItem, host: Host): MediaItem;
}

export interface LibraryContribution<Host extends AnimeListFeatureHost> {
  readonly kind: "library";
  prepareAdapters?(
    adapters: LibraryRenderAdapters,
    context: Omit<LibraryRenderContext<Host>, "adapters">,
  ): LibraryRenderAdapters;
  afterRender?(context: LibraryRenderContext<Host>): void;
}

export interface SearchContribution<Host extends AnimeListFeatureHost> {
  readonly kind: "search";
  afterRender(context: SearchRenderContext<Host>): void;
}

export interface MediaFormContribution<Host extends AnimeListFeatureHost> {
  readonly kind: "media-form";
  configure?(context: MediaFormContext<Host>): void;
  prepareSubmit?(context: MediaFormSubmitContext<Host>): void | Promise<void>;
}

export interface FavoriteContribution<Host extends AnimeListFeatureHost> {
  readonly kind: "favorite";
  handle(context: FavoriteActionContext<Host>): boolean | Promise<boolean>;
}

export interface SettingsContribution<Host extends AnimeListFeatureHost> {
  readonly kind: "settings";
  sections(host: Host): FeatureSettingsSection | FeatureSettingsSection[];
}

export interface DetailContribution<Host extends AnimeListFeatureHost> {
  readonly kind: "detail";
  afterRender(context: DetailRenderContext<Host>): void;
}

export interface WorkspacePageContribution<Host extends AnimeListFeatureHost> {
  readonly kind: "workspace-page";
  page(host: Host): WorkspacePageDefinition | null;
}

export interface WorkspaceActionContribution<Host extends AnimeListFeatureHost> {
  readonly kind: "workspace-action";
  action(host: Host): WorkspaceMenuAction | null;
}

export type AnimeListContribution<Host extends AnimeListFeatureHost> =
  | LifecycleContribution<Host>
  | MediaItemContribution<Host>
  | LibraryContribution<Host>
  | SearchContribution<Host>
  | MediaFormContribution<Host>
  | FavoriteContribution<Host>
  | SettingsContribution<Host>
  | DetailContribution<Host>
  | WorkspacePageContribution<Host>
  | WorkspaceActionContribution<Host>;

export interface AnimeListFeature<Host extends AnimeListFeatureHost = AnimeListFeatureHost> {
  readonly id: string;
  readonly dependsOn?: readonly string[];
  readonly contributions: readonly AnimeListContribution<Host>[];
}

export function defineFeature<Host extends AnimeListFeatureHost>(
  feature: AnimeListFeature<Host>,
): AnimeListFeature<Host> {
  return feature;
}
