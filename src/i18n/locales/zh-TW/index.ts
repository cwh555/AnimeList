import { CORE_MESSAGES } from "./core";
import { MASTERPIECE_MESSAGES } from "./masterpiece";
import { PROGRESS_UNIT_MESSAGES } from "./progress-unit";
import { RATING_MESSAGES } from "./rating";
import { SCORE_DASHBOARD_MESSAGES } from "./score-dashboard";
import { SEARCH_MESSAGES } from "./search";
import { SERIAL_COVER_MESSAGES } from "./serial-cover";

export {
  CORE_MESSAGES,
  MASTERPIECE_MESSAGES,
  PROGRESS_UNIT_MESSAGES,
  RATING_MESSAGES,
  SCORE_DASHBOARD_MESSAGES,
  SEARCH_MESSAGES,
  SERIAL_COVER_MESSAGES,
};

export const ZH_TW_CATALOGS = {
  core: CORE_MESSAGES,
  search: SEARCH_MESSAGES,
  rating: RATING_MESSAGES,
  "serial-cover": SERIAL_COVER_MESSAGES,
  "progress-unit": PROGRESS_UNIT_MESSAGES,
  masterpiece: MASTERPIECE_MESSAGES,
  "score-dashboard": SCORE_DASHBOARD_MESSAGES,
} as const;

export type ZhTwCatalogNamespace = keyof typeof ZH_TW_CATALOGS;
