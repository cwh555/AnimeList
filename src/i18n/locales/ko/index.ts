import type { LocaleCatalogs } from "../zh-TW";
import { KO_CORE_MESSAGES } from "./core";
import { KO_SEARCH_MESSAGES } from "./search";
import { KO_RATING_MESSAGES } from "./rating";
import { KO_SERIAL_COVER_MESSAGES } from "./serial-cover";
import { KO_PROGRESS_UNIT_MESSAGES } from "./progress-unit";
import { KO_MASTERPIECE_MESSAGES } from "./masterpiece";
import { KO_SCORE_DASHBOARD_MESSAGES } from "./score-dashboard";
import { KO_LEGACY_METADATA_MESSAGES } from "./legacy-metadata";
import { KO_USER_TAG_MESSAGES } from "./user-tag";

export const KO_CATALOGS = {
  core: KO_CORE_MESSAGES,
  search: KO_SEARCH_MESSAGES,
  rating: KO_RATING_MESSAGES,
  "serial-cover": KO_SERIAL_COVER_MESSAGES,
  "progress-unit": KO_PROGRESS_UNIT_MESSAGES,
  masterpiece: KO_MASTERPIECE_MESSAGES,
  "score-dashboard": KO_SCORE_DASHBOARD_MESSAGES,
  "legacy-metadata": KO_LEGACY_METADATA_MESSAGES,
  "user-tag": KO_USER_TAG_MESSAGES,
} as const satisfies LocaleCatalogs;
