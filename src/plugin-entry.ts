import type { AnimeListFeature, AnimeListFeatureHost } from "./app/feature-types";
import { registerBundledLocales } from "./i18n/locales";
import { additionalProgressUnitsFeature } from "./additional-progress-units-ui";
import AnimeListPlugin from "./main";
import { masterpieceFeature } from "./masterpiece-ui";
import { legacyMetadataSettingsFeature } from "./legacy-metadata-settings";
import { progressUiFeature } from "./progress-ui";
import { ratingFeature } from "./rating-ui";
import { releaseTrackingFeature } from "./release-tracking-feature";
import { scoreDashboardFeature } from "./score-dashboard-feature";
import { searchEnhancementsFeature } from "./search-enhancements";
import { searchPaginationFeature } from "./search-pagination";
import { serialEntryCoversFeature } from "./serial-cover-feature";
import { serialCoverSettingsFeature } from "./serial-cover-settings";
import { userTagSettingsFeature } from "./user-tag-settings";

registerBundledLocales();

const FEATURES: readonly AnimeListFeature<AnimeListFeatureHost>[] = [
  progressUiFeature,
  searchPaginationFeature,
  searchEnhancementsFeature,
  ratingFeature,
  releaseTrackingFeature,
  additionalProgressUnitsFeature,
  serialEntryCoversFeature,
  serialCoverSettingsFeature,
  legacyMetadataSettingsFeature,
  userTagSettingsFeature,
  masterpieceFeature,
  scoreDashboardFeature,
];

export default class AnimeListPluginEntry extends AnimeListPlugin {
  protected featureManifest(): readonly AnimeListFeature<AnimeListFeatureHost>[] {
    return FEATURES;
  }
}
