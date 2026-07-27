import type { App, TFile } from "obsidian";
import type { CoverThumbnailCache } from "../cover-cache";
import {
  ExternalMediaSearchService,
  HttpMetadataProviderClient,
  type MetadataProviderClient,
} from "../data/external-media-service";
import { LibraryStorage } from "../data/library-storage";
import { MediaNoteService } from "../data/media-note-service";
import { MediaRepository } from "../data/media-repository";
import type { AnimeListSettings } from "../types";
import {
  AnimeListSettingsStore,
  type SettingsStorage,
} from "../settings-store";

export interface PluginServiceCallbacks {
  readonly app: App;
  readonly settingsStorage: SettingsStorage;
  getSettings(): AnimeListSettings;
  getCoverCache(): CoverThumbnailCache | undefined;
  openMediaFile(path: string): Promise<void>;
  refreshViews(): void;
  searchBangumi(mediaType: import("../types").MediaType, query: string): Promise<import("../types").ExternalMediaResult[]>;
  searchAniList(mediaType: import("../types").MediaType, query: string): Promise<import("../types").ExternalMediaResult[]>;
  searchOpenLibrary(query: string): Promise<import("../types").ExternalMediaResult[]>;
}

export class AnimeListPluginServices {
  private storageValue?: LibraryStorage;
  private repositoryValue?: MediaRepository;
  private providerValue?: MetadataProviderClient;
  private searchValue?: ExternalMediaSearchService;
  private noteValue?: MediaNoteService;
  readonly settingsStore: AnimeListSettingsStore;

  constructor(private readonly callbacks: PluginServiceCallbacks) {
    this.settingsStore = new AnimeListSettingsStore(callbacks.settingsStorage);
  }

  get storage(): LibraryStorage {
    this.storageValue ??= new LibraryStorage(
      this.callbacks.app,
      () => this.callbacks.getSettings(),
    );
    return this.storageValue;
  }

  get repository(): MediaRepository {
    this.repositoryValue ??= new MediaRepository(
      this.callbacks.app,
      (file) => this.callbacks.getCoverCache()?.getSources(file),
    );
    return this.repositoryValue;
  }

  get provider(): MetadataProviderClient {
    this.providerValue ??= new HttpMetadataProviderClient();
    return this.providerValue;
  }

  get search(): ExternalMediaSearchService {
    this.searchValue ??= new ExternalMediaSearchService(
      () => this.callbacks.getSettings().providers,
      {
        searchBangumi: (mediaType, query) => this.callbacks.searchBangumi(mediaType, query),
        searchAniList: (mediaType, query) => this.callbacks.searchAniList(mediaType, query),
        searchOpenLibrary: (query) => this.callbacks.searchOpenLibrary(query),
      },
    );
    return this.searchValue;
  }

  get notes(): MediaNoteService {
    this.noteValue ??= new MediaNoteService(
      this.callbacks.app,
      () => this.callbacks.getSettings(),
      this.repository,
      this.storage,
      {
        optimizeFile: (file: TFile) => this.callbacks.getCoverCache()?.optimizeFile(file)
          ?? Promise.resolve(),
      },
      {
        openMediaFile: (path) => this.callbacks.openMediaFile(path),
        refreshViews: () => this.callbacks.refreshViews(),
      },
    );
    return this.noteValue;
  }
}
