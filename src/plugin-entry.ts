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

const FEATURE_INSTALLERS = [
  { id: "progress-display", install: installProgressUi },
  { id: "search-pagination", install: installSearchPagination },
  { id: "rating", install: installRatingUi },
  { id: "progress-units", install: installAdditionalProgressUnitsUi },
  { id: "serial-entry-covers", install: installSerialEntryCovers },
  { id: "serial-entry-scroll", install: installSerialEntryScrollStability },
  { id: "serial-cover-settings", install: installSerialCoverSettings },
  { id: "masterpiece-labels", install: installMasterpieceLabels },
  { id: "masterpiece-operations", install: installMasterpieceOperationUi },
  { id: "masterpiece-edit", install: installMasterpieceEditUi },
  { id: "masterpiece-grouped-view", install: installMasterpieceGroupedView },
  { id: "score-dashboard", install: installScoreDashboard },
] satisfies readonly FeatureInstaller<AnimeListPlugin>[];

export default class AnimeListPluginEntry extends AnimeListPlugin {
  async onload(): Promise<void> {
    await super.onload();
    await installFeatureSet(this, FEATURE_INSTALLERS);
  }
}
