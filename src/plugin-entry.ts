import type { AnimeListFeature, AnimeListFeatureHost } from "./app/feature-types";
import { registerBundledLocales } from "./i18n/locales";
import { additionalProgressUnitsFeature } from "./features/progress/additional-progress-units";
import AnimeListPlugin from "./main";
import { masterpieceFeature } from "./features/masterpiece/feature";
import { imageSectionFeature } from "./features/image-sections/feature";
import { imageGalleryFeature } from "./features/image-gallery/feature";
import { libraryLayoutSettingsFeature } from "./features/library-layout/settings";
import { libraryExportFeature } from "./features/library-export/feature";
import { momentsFeature } from "./features/moments/feature";
import { progressUiFeature } from "./features/progress/feature";
import { ratingFeature } from "./features/rating/feature";
import { releaseTrackingFeature } from "./features/release-tracking/feature";
import { scoreDashboardFeature } from "./features/score-dashboard/feature";
import { searchEnhancementsFeature } from "./features/search/enhancements";
import { searchPaginationFeature } from "./features/search/pagination";
import { serialEntryCoversFeature } from "./features/serial-covers/feature";
import { serialCoverSettingsFeature } from "./features/serial-covers/settings";
import { userTagSettingsFeature } from "./features/user-tags/settings";
import { versionCleanupSettingsFeature } from "./features/version-cleanup/settings";
import { noteReadingRailsFeature } from "./features/note-reading-rails/feature";

registerBundledLocales();

const FEATURES: readonly AnimeListFeature<AnimeListFeatureHost>[] = [
  progressUiFeature,
  searchPaginationFeature,
  searchEnhancementsFeature,
  ratingFeature,
  imageSectionFeature,
  imageGalleryFeature,
  momentsFeature,
  libraryLayoutSettingsFeature,
  libraryExportFeature,
  releaseTrackingFeature,
  additionalProgressUnitsFeature,
  serialEntryCoversFeature,
  serialCoverSettingsFeature,
  versionCleanupSettingsFeature,
  userTagSettingsFeature,
  masterpieceFeature,
  scoreDashboardFeature,
  noteReadingRailsFeature,
];

export default class AnimeListPluginEntry extends AnimeListPlugin {
  protected featureManifest(): readonly AnimeListFeature<AnimeListFeatureHost>[] {
    return FEATURES;
  }
}
