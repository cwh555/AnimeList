import type { MediaType } from "./types";
import { defineTextCatalog } from "./i18n/catalog";
import { CORE_MESSAGES } from "./i18n/locales/zh-TW/core";
import {
  MEDIA_STATUS_FILTER_ORDER,
  MEDIA_STATUS_VALUES,
  normalizeMediaStatus,
} from "./media-status";
import type { MediaStatus, MediaStatusFilter } from "./media-status";

/**
 * Typed adapter for AnimeList's core user-visible text catalog.
 * Product wording lives under src/i18n/locales so locale content stays separate
 * from UI behavior and can later be mirrored by additional languages.
 */
export const UI_TEXT = CORE_MESSAGES;

const UI_CATALOG = defineTextCatalog("core", UI_TEXT);

export type UiMediaType = "all" | MediaType;
export type UiStatusFilter = MediaStatusFilter;
export type UiTextKey = keyof typeof UI_TEXT;
export type UiTextVariables = Record<string, string | number>;

const STATUS_TEXT_KEYS = {
  planned: "media.status.planned",
  ongoing: "media.status.ongoing",
  completed: "media.status.completed",
  dropped: "media.status.dropped",
} as const satisfies Record<MediaStatus, UiTextKey>;

export function uiText(key: UiTextKey, variables: UiTextVariables = {}): string {
  return UI_CATALOG.text(key, variables);
}

export function completedStatusLabel(_mediaType: MediaType): string {
  return uiText("media.status.completed");
}

export function mediaStatusLabel(status: string, _mediaType: UiMediaType = "all"): string {
  const normalized = normalizeMediaStatus(status);
  return uiText(STATUS_TEXT_KEYS[normalized]);
}

export function mediaStatusOptions(): Array<[MediaStatus, string]> {
  return MEDIA_STATUS_VALUES.map((status) => [status, uiText(STATUS_TEXT_KEYS[status])]);
}

export function statusFilterOptions(_mediaType: UiMediaType): Array<[UiStatusFilter, string]> {
  return [
    ["all", uiText("media.status.all")],
    ...MEDIA_STATUS_FILTER_ORDER.map((status): [MediaStatus, string] => [status, uiText(STATUS_TEXT_KEYS[status])]),
  ];
}

export function completedRequirementMessage(mediaType: MediaType, field: string): string {
  return uiText("validation.completedFieldRequired", {
    status: completedStatusLabel(mediaType),
    field,
  });
}

const FORMAT_KEYS = {
  tv: "media.format.tv",
  movie: "media.format.movie",
  ova: "media.format.ova",
  ona: "media.format.ona",
  special: "media.format.special",
  music: "media.format.music",
  manga: "media.format.manga",
  one_shot: "media.format.oneShot",
  manhwa: "media.format.manhwa",
  manhua: "media.format.manhua",
  light_novel: "media.format.lightNovel",
  novel: "media.format.novel",
} as const satisfies Record<string, UiTextKey>;

const PROVIDER_KEYS = {
  bangumi: "media.provider.bangumi",
  anilist: "media.provider.anilist",
  openlibrary: "media.provider.openlibrary",
  manual: "media.provider.manual",
} as const satisfies Record<string, UiTextKey>;

export function mediaFormatLabel(format: string): string {
  const key = FORMAT_KEYS[format as keyof typeof FORMAT_KEYS];
  return key ? uiText(key) : format;
}

export function mediaProviderLabel(provider: string): string {
  const key = PROVIDER_KEYS[provider as keyof typeof PROVIDER_KEYS];
  return key ? uiText(key) : provider;
}
