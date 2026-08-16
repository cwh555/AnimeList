import { normalizeStatusFilter } from "./media-status";
import { DEFAULT_INTERFACE_LANGUAGE, normalizeLanguagePreference } from "./i18n/locale";
import { normalizeSpecialLabelMode } from "./masterpiece-labels";
import {
  DEFAULT_SEARCH_LANGUAGES,
  normalizeSearchLanguageSettings,
} from "./multilingual-search";
import {
  DEFAULT_TIMELINE_MAX_STACK_DEPTH,
  normalizeTimelineMaxStackDepth,
} from "./timeline-scale";
import type { AnimeListSettings } from "./domain/settings-types";
import { normalizeLibraryFilters } from "./domain/library-filters";
import { normalizeUserTagCatalog } from "./domain/user-tag-catalog";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export const DEFAULT_SETTINGS: AnimeListSettings = {
  interfaceLanguage: DEFAULT_INTERFACE_LANGUAGE,
  storageMode: "managed",
  libraryRoot: "AnimeList",
  flatMediaFolder: "AnimeList",
  additionalScanFolders: [],
  coverFolder: "AnimeList/Covers",
  templateFolder: "AnimeList/Templates",
  timelineMaxStackDepth: DEFAULT_TIMELINE_MAX_STACK_DEPTH,
  googleBooksApiKey: "",
  providers: {
    bangumi: true,
    anilist: true,
    openlibrary: true,
  },
  searchLanguages: { ...DEFAULT_SEARCH_LANGUAGES },
  tagCatalog: [],
  specialLabelMode: "favorite",
  releaseTracking: {
    enabled: false,
    automatic: false,
    lastAutomaticCheckAt: "",
  },
  migrations: {
    mediaStatus: 0,
  },
  uiState: {
    section: "library",
    type: "all",
    status: "all",
    filters: { companies: [], quarter: "", tags: [] },
    sort: "completed-desc",
    view: "grid",
  },
};

export function createDefaultSettings(): AnimeListSettings {
  return structuredClone(DEFAULT_SETTINGS);
}

/**
 * Normalize known settings while retaining unknown top-level and nested fields.
 * Retention matters because feature settings and future versions share the same
 * Obsidian data document.
 */
export function normalizeAnimeListSettings(value: unknown): AnimeListSettings {
  const loaded = isRecord(value) ? value : {};
  const providers = isRecord(loaded.providers) ? loaded.providers : {};
  const migrations = isRecord(loaded.migrations) ? loaded.migrations : {};
  const releaseTracking = isRecord(loaded.releaseTracking) ? loaded.releaseTracking : {};
  const uiState = isRecord(loaded.uiState) ? loaded.uiState : {};
  const { genre: legacyGenre, ...retainedUiState } = uiState;

  return {
    ...loaded,
    interfaceLanguage: normalizeLanguagePreference(loaded.interfaceLanguage),
    storageMode: loaded.storageMode === "flat" ? "flat" : "managed",
    libraryRoot: stringValue(loaded.libraryRoot, DEFAULT_SETTINGS.libraryRoot),
    flatMediaFolder: stringValue(loaded.flatMediaFolder, DEFAULT_SETTINGS.flatMediaFolder),
    additionalScanFolders: stringArray(loaded.additionalScanFolders),
    coverFolder: stringValue(loaded.coverFolder, DEFAULT_SETTINGS.coverFolder),
    templateFolder: stringValue(loaded.templateFolder, DEFAULT_SETTINGS.templateFolder),
    timelineMaxStackDepth: normalizeTimelineMaxStackDepth(loaded.timelineMaxStackDepth),
    googleBooksApiKey: typeof loaded.googleBooksApiKey === "string"
      ? loaded.googleBooksApiKey.trim()
      : DEFAULT_SETTINGS.googleBooksApiKey,
    providers: {
      ...providers,
      bangumi: typeof providers.bangumi === "boolean"
        ? providers.bangumi
        : DEFAULT_SETTINGS.providers.bangumi,
      anilist: typeof providers.anilist === "boolean"
        ? providers.anilist
        : DEFAULT_SETTINGS.providers.anilist,
      openlibrary: typeof providers.openlibrary === "boolean"
        ? providers.openlibrary
        : DEFAULT_SETTINGS.providers.openlibrary,
    },
    searchLanguages: normalizeSearchLanguageSettings(loaded.searchLanguages),
    tagCatalog: normalizeUserTagCatalog(loaded.tagCatalog),
    specialLabelMode: normalizeSpecialLabelMode(loaded.specialLabelMode),
    releaseTracking: {
      ...releaseTracking,
      enabled: releaseTracking.enabled === true,
      automatic: releaseTracking.automatic === true,
      lastAutomaticCheckAt: stringValue(releaseTracking.lastAutomaticCheckAt, ""),
    },
    migrations: {
      ...migrations,
      mediaStatus: typeof migrations.mediaStatus === "number"
        ? migrations.mediaStatus
        : DEFAULT_SETTINGS.migrations.mediaStatus,
    },
    uiState: {
      ...retainedUiState,
      section: uiState.section === "timeline" ? "timeline" : "library",
      type: uiState.type === "anime" || uiState.type === "manga" || uiState.type === "novel"
        ? uiState.type
        : "all",
      status: normalizeStatusFilter(uiState.status),
      filters: normalizeLibraryFilters(uiState.filters, legacyGenre),
      sort: stringValue(uiState.sort, DEFAULT_SETTINGS.uiState.sort),
      view: uiState.view === "list" || uiState.view === "poster" ? uiState.view : "grid",
    },
  };
}
