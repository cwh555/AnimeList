import type { LocaleCatalogs } from "../zh-TW";
import { EN_CORE_MESSAGES } from "./core";
import { EN_SEARCH_MESSAGES } from "./search";
import { EN_RATING_MESSAGES } from "./rating";
import { EN_RELEASE_TRACKING_MESSAGES } from "./release-tracking";
import { EN_SERIAL_COVER_MESSAGES } from "./serial-cover";
import { EN_PROGRESS_UNIT_MESSAGES } from "./progress-unit";
import { EN_MASTERPIECE_MESSAGES } from "./masterpiece";
import { EN_SCORE_DASHBOARD_MESSAGES } from "./score-dashboard";
import { EN_LEGACY_METADATA_MESSAGES } from "./legacy-metadata";
import { EN_USER_TAG_MESSAGES } from "./user-tag";
import { EN_IMAGE_SECTION_MESSAGES } from "./image-section";
import { EN_MOMENTS_MESSAGES } from "./moments";
import { EN_IMAGE_GALLERY_MESSAGES } from "./image-gallery";

import { EN_LIBRARY_LAYOUT_MESSAGES } from "./library-layout";

export const EN_CATALOGS = {
  core: EN_CORE_MESSAGES,
  search: EN_SEARCH_MESSAGES,
  rating: EN_RATING_MESSAGES,
  "release-tracking": EN_RELEASE_TRACKING_MESSAGES,
  "serial-cover": EN_SERIAL_COVER_MESSAGES,
  "progress-unit": EN_PROGRESS_UNIT_MESSAGES,
  masterpiece: EN_MASTERPIECE_MESSAGES,
  "score-dashboard": EN_SCORE_DASHBOARD_MESSAGES,
  "legacy-metadata": EN_LEGACY_METADATA_MESSAGES,
  "user-tag": EN_USER_TAG_MESSAGES,
  "image-section": EN_IMAGE_SECTION_MESSAGES,
  moments: EN_MOMENTS_MESSAGES,
  "image-gallery": EN_IMAGE_GALLERY_MESSAGES,
  "library-layout": EN_LIBRARY_LAYOUT_MESSAGES,
} as const satisfies LocaleCatalogs;
