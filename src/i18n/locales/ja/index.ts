import type { LocaleCatalogs } from "../zh-TW";
import { JA_CORE_MESSAGES } from "./core";
import { JA_SEARCH_MESSAGES } from "./search";
import { JA_RATING_MESSAGES } from "./rating";
import { JA_RELEASE_TRACKING_MESSAGES } from "./release-tracking";
import { JA_SERIAL_COVER_MESSAGES } from "./serial-cover";
import { JA_PROGRESS_UNIT_MESSAGES } from "./progress-unit";
import { JA_MASTERPIECE_MESSAGES } from "./masterpiece";
import { JA_SCORE_DASHBOARD_MESSAGES } from "./score-dashboard";
import { JA_LEGACY_METADATA_MESSAGES } from "./legacy-metadata";
import { JA_USER_TAG_MESSAGES } from "./user-tag";
import { JA_IMAGE_SECTION_MESSAGES } from "./image-section";
import { JA_MOMENTS_MESSAGES } from "./moments";
import { JA_IMAGE_GALLERY_MESSAGES } from "./image-gallery";

import { JA_LIBRARY_LAYOUT_MESSAGES } from "./library-layout";
import { JA_LIBRARY_EXPORT_MESSAGES } from "./library-export";
import { JA_TIMELINE_WORKSPACE_MESSAGES } from "./timeline-workspace";
import { JA_MANUAL_MEDIA_MESSAGES } from "./manual-media";

export const JA_CATALOGS = {
  core: JA_CORE_MESSAGES,
  search: JA_SEARCH_MESSAGES,
  rating: JA_RATING_MESSAGES,
  "release-tracking": JA_RELEASE_TRACKING_MESSAGES,
  "serial-cover": JA_SERIAL_COVER_MESSAGES,
  "progress-unit": JA_PROGRESS_UNIT_MESSAGES,
  masterpiece: JA_MASTERPIECE_MESSAGES,
  "score-dashboard": JA_SCORE_DASHBOARD_MESSAGES,
  "legacy-metadata": JA_LEGACY_METADATA_MESSAGES,
  "user-tag": JA_USER_TAG_MESSAGES,
  "image-section": JA_IMAGE_SECTION_MESSAGES,
  moments: JA_MOMENTS_MESSAGES,
  "image-gallery": JA_IMAGE_GALLERY_MESSAGES,
  "library-layout": JA_LIBRARY_LAYOUT_MESSAGES,
  "library-export": JA_LIBRARY_EXPORT_MESSAGES,
  "timeline-workspace": JA_TIMELINE_WORKSPACE_MESSAGES,
  "manual-media": JA_MANUAL_MEDIA_MESSAGES,
} as const satisfies LocaleCatalogs;
