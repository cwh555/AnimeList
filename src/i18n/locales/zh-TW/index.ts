import { CORE_MESSAGES } from "./core";
import { LEGACY_METADATA_MESSAGES } from "./legacy-metadata";
import { MASTERPIECE_MESSAGES } from "./masterpiece";
import { PROGRESS_UNIT_MESSAGES } from "./progress-unit";
import { RATING_MESSAGES } from "./rating";
import { SCORE_DASHBOARD_MESSAGES } from "./score-dashboard";
import { SEARCH_MESSAGES } from "./search";
import { SERIAL_COVER_MESSAGES } from "./serial-cover";
import { USER_TAG_MESSAGES } from "./user-tag";

export {
  CORE_MESSAGES,
  LEGACY_METADATA_MESSAGES,
  MASTERPIECE_MESSAGES,
  PROGRESS_UNIT_MESSAGES,
  RATING_MESSAGES,
  SCORE_DASHBOARD_MESSAGES,
  SEARCH_MESSAGES,
  SERIAL_COVER_MESSAGES,
  USER_TAG_MESSAGES,
};

export const ZH_TW_CATALOGS = {
  core: CORE_MESSAGES,
  search: SEARCH_MESSAGES,
  rating: RATING_MESSAGES,
  "serial-cover": SERIAL_COVER_MESSAGES,
  "progress-unit": PROGRESS_UNIT_MESSAGES,
  masterpiece: MASTERPIECE_MESSAGES,
  "score-dashboard": SCORE_DASHBOARD_MESSAGES,
  "legacy-metadata": LEGACY_METADATA_MESSAGES,
  "user-tag": USER_TAG_MESSAGES,
} as const;

export type ZhTwCatalogNamespace = keyof typeof ZH_TW_CATALOGS;
export type LocaleCatalogs = {
  [N in ZhTwCatalogNamespace]: {
    [K in keyof (typeof ZH_TW_CATALOGS)[N]]: string;
  };
};
