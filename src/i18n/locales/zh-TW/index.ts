import { CORE_MESSAGES } from "./core";
import { LEGACY_METADATA_MESSAGES } from "./legacy-metadata";
import { MASTERPIECE_MESSAGES } from "./masterpiece";
import { PROGRESS_UNIT_MESSAGES } from "./progress-unit";
import { RATING_MESSAGES } from "./rating";
import { RELEASE_TRACKING_MESSAGES } from "./release-tracking";
import { SCORE_DASHBOARD_MESSAGES } from "./score-dashboard";
import { SEARCH_MESSAGES } from "./search";
import { SERIAL_COVER_MESSAGES } from "./serial-cover";
import { USER_TAG_MESSAGES } from "./user-tag";
import { IMAGE_SECTION_MESSAGES } from "./image-section";
import { MOMENTS_MESSAGES } from "./moments";
import { IMAGE_GALLERY_MESSAGES } from "./image-gallery";
import { LIBRARY_EXPORT_MESSAGES } from "./library-export";

export {
  CORE_MESSAGES,
  LEGACY_METADATA_MESSAGES,
  MASTERPIECE_MESSAGES,
  PROGRESS_UNIT_MESSAGES,
  RATING_MESSAGES,
  RELEASE_TRACKING_MESSAGES,
  SCORE_DASHBOARD_MESSAGES,
  SEARCH_MESSAGES,
  SERIAL_COVER_MESSAGES,
  USER_TAG_MESSAGES,
  IMAGE_SECTION_MESSAGES,
  MOMENTS_MESSAGES,
  IMAGE_GALLERY_MESSAGES,
  LIBRARY_EXPORT_MESSAGES,
};

import { LIBRARY_LAYOUT_MESSAGES } from "./library-layout";

export const ZH_TW_CATALOGS = {
  core: CORE_MESSAGES,
  search: SEARCH_MESSAGES,
  rating: RATING_MESSAGES,
  "release-tracking": RELEASE_TRACKING_MESSAGES,
  "serial-cover": SERIAL_COVER_MESSAGES,
  "progress-unit": PROGRESS_UNIT_MESSAGES,
  masterpiece: MASTERPIECE_MESSAGES,
  "score-dashboard": SCORE_DASHBOARD_MESSAGES,
  "legacy-metadata": LEGACY_METADATA_MESSAGES,
  "user-tag": USER_TAG_MESSAGES,
  "image-section": IMAGE_SECTION_MESSAGES,
  moments: MOMENTS_MESSAGES,
  "image-gallery": IMAGE_GALLERY_MESSAGES,
  "library-layout": LIBRARY_LAYOUT_MESSAGES,
  "library-export": LIBRARY_EXPORT_MESSAGES,
} as const;

export type ZhTwCatalogNamespace = keyof typeof ZH_TW_CATALOGS;
export type LocaleCatalogs = {
  [N in ZhTwCatalogNamespace]: {
    [K in keyof (typeof ZH_TW_CATALOGS)[N]]: string;
  };
};
