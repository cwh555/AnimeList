import type { AnimeListFeature, AnimeListFeatureHost } from "./app/feature-types";
import { registerBundledLocales } from "./i18n/locales";
import { additionalProgressUnitsFeature } from "./additional-progress-units-ui";
import AnimeListPlugin from "./main";
import { masterpieceFeature } from "./masterpiece-ui";
import { imageSectionFeature } from "./image-section-feature";
import { momentsFeature } from "./moments-feature";
import { progressUiFeature } from "./progress-ui";
import { ratingFeature } from "./rating-ui";
import { releaseTrackingFeature } from "./release-tracking-feature";
import { scoreDashboardFeature } from "./score-dashboard-feature";
import { searchEnhancementsFeature } from "./search-enhancements";
import { searchPaginationFeature } from "./search-pagination";
import { serialEntryCoversFeature } from "./serial-cover-feature";
import { serialCoverSettingsFeature } from "./serial-cover-settings";
import { userTagSettingsFeature } from "./user-tag-settings";
import { versionCleanupSettingsFeature } from "./version-cleanup-settings";

registerBundledLocales();

const FEATURES: readonly AnimeListFeature<AnimeListFeatureHost>[] = [
  progressUiFeature,
  searchPaginationFeature,
  searchEnhancementsFeature,
  ratingFeature,
  imageSectionFeature,
  momentsFeature,
  releaseTrackingFeature,
  additionalProgressUnitsFeature,
  serialEntryCoversFeature,
  serialCoverSettingsFeature,
  versionCleanupSettingsFeature,
  userTagSettingsFeature,
  masterpieceFeature,
  scoreDashboardFeature,
];

export default class AnimeListPluginEntry extends AnimeListPlugin {
  protected featureManifest(): readonly AnimeListFeature<AnimeListFeatureHost>[] {
    return FEATURES;
  }
}
