import type { MediaItem } from "../types";
import type { LibraryRenderAdapters, LibraryRenderContext } from "../ui/library-contracts";
import type { MediaFormContext, MediaFormSubmitContext } from "../ui/media-form-contracts";
import type { SearchRenderContext } from "../ui/search-contracts";
import type {
  AnimeListFeature,
  AnimeListFeatureHost,
  DetailContribution,
  DetailRenderContext,
  FavoriteActionContext,
  FavoriteContribution,
  FeatureSettingsSection,
  LibraryContribution,
  LifecycleContribution,
  MediaFormContribution,
  MediaItemContribution,
  SearchContribution,
  SettingsContribution,
} from "./feature-types";

function validateManifest<Host extends AnimeListFeatureHost>(
  features: readonly AnimeListFeature<Host>[],
): void {
  const indices = new Map<string, number>();
  for (const [index, feature] of features.entries()) {
    if (indices.has(feature.id)) throw new Error(`Duplicate feature: ${feature.id}`);
    indices.set(feature.id, index);
  }

  for (const [index, feature] of features.entries()) {
    for (const dependency of feature.dependsOn ?? []) {
      const dependencyIndex = indices.get(dependency);
      if (dependencyIndex === undefined) {
        throw new Error(`Feature ${feature.id} depends on missing feature: ${dependency}`);
      }
      if (dependencyIndex >= index) {
        throw new Error(`Feature ${feature.id} depends on ${dependency}, which must appear earlier`);
      }
    }
  }
}

export class AnimeListFeatureRegistry<Host extends AnimeListFeatureHost> {
  private readonly lifecycle: LifecycleContribution<Host>[] = [];
  private readonly mediaItems: MediaItemContribution<Host>[] = [];
  private readonly library: LibraryContribution<Host>[] = [];
  private readonly search: SearchContribution<Host>[] = [];
  private readonly mediaForms: MediaFormContribution<Host>[] = [];
  private readonly favorites: FavoriteContribution<Host>[] = [];
  private readonly settings: SettingsContribution<Host>[] = [];
  private readonly details: DetailContribution<Host>[] = [];
  private loaded = false;
  private activated = false;

  load(features: readonly AnimeListFeature<Host>[]): void {
    if (this.loaded) throw new Error("Feature manifest is already loaded");
    validateManifest(features);

    for (const feature of features) {
      for (const contribution of feature.contributions) {
        switch (contribution.kind) {
          case "lifecycle": this.lifecycle.push(contribution); break;
          case "media-item": this.mediaItems.push(contribution); break;
          case "library": this.library.push(contribution); break;
          case "search": this.search.push(contribution); break;
          case "media-form": this.mediaForms.push(contribution); break;
          case "favorite": this.favorites.push(contribution); break;
          case "settings": this.settings.push(contribution); break;
          case "detail": this.details.push(contribution); break;
        }
      }
    }
    this.loaded = true;
  }

  async activate(host: Host): Promise<void> {
    if (!this.loaded) throw new Error("Feature manifest is not loaded");
    if (this.activated) throw new Error("Feature manifest is already activated");
    for (const contribution of this.lifecycle) await contribution.activate(host);
    this.activated = true;
  }

  decorateMediaItems(items: MediaItem[], host: Host): MediaItem[] {
    return items.map((item) => this.mediaItems.reduce(
      (current, contribution) => contribution.decorate(current, host),
      item,
    ));
  }

  prepareLibraryAdapters(
    host: Host,
    container: HTMLElement,
    items: MediaItem[],
    adapters: LibraryRenderAdapters,
  ): LibraryRenderAdapters {
    const context = { host, container, items };
    return this.library.reduce(
      (current, contribution) => contribution.prepareAdapters?.(current, context) ?? current,
      adapters,
    );
  }

  afterLibraryRender(context: LibraryRenderContext<Host>): void {
    for (const contribution of this.library) contribution.afterRender?.(context);
  }

  afterSearchRender(context: SearchRenderContext<Host>): void {
    for (const contribution of this.search) contribution.afterRender(context);
  }

  configureMediaForm(context: MediaFormContext<Host>): void {
    for (const contribution of this.mediaForms) contribution.configure?.(context);
  }

  async prepareMediaSubmit(context: MediaFormSubmitContext<Host>): Promise<void> {
    for (const contribution of this.mediaForms) await contribution.prepareSubmit?.(context);
  }

  async handleFavorite(context: FavoriteActionContext<Host>): Promise<boolean> {
    for (const contribution of this.favorites) {
      if (await contribution.handle(context)) return true;
    }
    return false;
  }

  settingsSections(host: Host): FeatureSettingsSection[] {
    return this.settings.flatMap((contribution) => {
      const value = contribution.sections(host);
      return Array.isArray(value) ? value : [value];
    });
  }

  afterDetailRender(context: DetailRenderContext<Host>): void {
    for (const contribution of this.details) contribution.afterRender(context);
  }
}
