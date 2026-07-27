import AnimeListPlugin from "./main";
import type { FeatureInstaller } from "./app/feature-installer";
import { installFeatureSet } from "./app/feature-installer";
import { installAdditionalProgressUnitsUi } from "./additional-progress-units-ui";
import { installMasterpieceEditUi } from "./masterpiece-edit-ui";
import { installMasterpieceGroupedView } from "./masterpiece-grouped-view";
import { installMasterpieceOperationUi } from "./masterpiece-operation-ui";
import { installMasterpieceLabels } from "./masterpiece-ui";
import { installProgressUi } from "./progress-ui";
import { installRatingUi } from "./rating-ui";
import { installScoreDashboard } from "./score-dashboard-feature";
import { installSearchPagination } from "./search-pagination";
import { installSerialEntryCovers } from "./serial-cover-feature";
import { installSerialEntryScrollStability } from "./serial-entry-scroll-stability";
import { installSerialCoverSettings } from "./serial-cover-settings";

const FEATURE_INSTALLERS: readonly FeatureInstaller<AnimeListPlugin>[] = [
  { id: "progress-display", order: 10, install: () => installProgressUi() },
  { id: "search-pagination", order: 20, install: () => installSearchPagination() },
  { id: "rating", order: 30, install: installRatingUi },
  { id: "progress-units", order: 40, install: installAdditionalProgressUnitsUi },
  { id: "serial-entry-covers", order: 50, install: installSerialEntryCovers },
  { id: "serial-entry-scroll", order: 60, install: installSerialEntryScrollStability },
  { id: "serial-cover-settings", order: 70, install: installSerialCoverSettings },
  { id: "masterpiece-labels", order: 80, install: installMasterpieceLabels },
  { id: "masterpiece-operations", order: 90, install: installMasterpieceOperationUi },
  { id: "masterpiece-edit", order: 100, install: installMasterpieceEditUi },
  { id: "masterpiece-grouped-view", order: 110, install: installMasterpieceGroupedView },
  { id: "score-dashboard", order: 120, install: installScoreDashboard },
];

export default class AnimeListPluginEntry extends AnimeListPlugin {
  async onload(): Promise<void> {
    await super.onload();
    await installFeatureSet(this, FEATURE_INSTALLERS);
  }
}
