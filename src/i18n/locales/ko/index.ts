import type { LocaleCatalogs } from "../zh-TW";
import { KO_CORE_MESSAGES } from "./core";
import { KO_SEARCH_MESSAGES } from "./search";
import { KO_RATING_MESSAGES } from "./rating";
import { KO_RELEASE_TRACKING_MESSAGES } from "./release-tracking";
import { KO_SERIAL_COVER_MESSAGES } from "./serial-cover";
import { KO_PROGRESS_UNIT_MESSAGES } from "./progress-unit";
import { KO_MASTERPIECE_MESSAGES } from "./masterpiece";
import { KO_SCORE_DASHBOARD_MESSAGES } from "./score-dashboard";
import { KO_LEGACY_METADATA_MESSAGES } from "./legacy-metadata";
import { KO_USER_TAG_MESSAGES } from "./user-tag";
import { KO_IMAGE_SECTION_MESSAGES } from "./image-section";
import { KO_MOMENTS_MESSAGES } from "./moments";
import { KO_IMAGE_GALLERY_MESSAGES } from "./image-gallery";

import { KO_LIBRARY_LAYOUT_MESSAGES } from "./library-layout";
import { KO_LIBRARY_EXPORT_MESSAGES } from "./library-export";
import { KO_TIMELINE_WORKSPACE_MESSAGES } from "./timeline-workspace";
import { KO_MANUAL_MEDIA_MESSAGES } from "./manual-media";

export const KO_CATALOGS = {
  core: KO_CORE_MESSAGES,
  search: KO_SEARCH_MESSAGES,
  rating: KO_RATING_MESSAGES,
  "release-tracking": KO_RELEASE_TRACKING_MESSAGES,
  "serial-cover": KO_SERIAL_COVER_MESSAGES,
  "progress-unit": KO_PROGRESS_UNIT_MESSAGES,
  masterpiece: KO_MASTERPIECE_MESSAGES,
  "score-dashboard": KO_SCORE_DASHBOARD_MESSAGES,
  "legacy-metadata": KO_LEGACY_METADATA_MESSAGES,
  "user-tag": KO_USER_TAG_MESSAGES,
  "image-section": KO_IMAGE_SECTION_MESSAGES,
  moments: KO_MOMENTS_MESSAGES,
  "image-gallery": KO_IMAGE_GALLERY_MESSAGES,
  "library-layout": KO_LIBRARY_LAYOUT_MESSAGES,
  "library-export": KO_LIBRARY_EXPORT_MESSAGES,
  "timeline-workspace": KO_TIMELINE_WORKSPACE_MESSAGES,
  "manual-media": KO_MANUAL_MEDIA_MESSAGES,
} as const satisfies LocaleCatalogs;
