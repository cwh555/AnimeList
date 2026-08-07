/**
 * Compatibility barrel. New code should import from domain/media-types or
 * domain/settings-types so dependencies remain explicit.
 */
export type {
  CoverSources,
  ExternalMediaResult,
  ExternalMediaSearchPage,
  MediaItem,
  MediaNoteForm,
  MediaType,
  NovelVolumeEntry,
  ProgressValue,
  ReleaseStatus,
  SerialProgressEntry,
  TemplateOption,
  TimelineMediaEntry,
} from "./domain/media-types";
export type {
  AnimeListSettings,
  LibrarySection,
  LibraryUiState,
  LibraryViewMode,
  MigrationSettings,
  ProviderSettings,
  SearchLanguage,
  SearchLanguageSettings,
  StorageMode,
} from "./domain/settings-types";
