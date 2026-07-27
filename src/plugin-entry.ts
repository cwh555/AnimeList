import { installSearchPagination } from "./search-pagination";
import { installSearchEnhancements } from "./search-enhancements";
import { installProgressUi } from "./progress-ui";
import AnimeListPlugin from "./main";
import { installAdditionalProgressUnitsUi } from "./additional-progress-units-ui";
import { installMasterpieceLabels } from "./masterpiece-ui";
import { installRatingUi } from "./rating-ui";
import { installScoreDashboard } from "./score-dashboard-feature";
import { installSerialEntryCovers } from "./serial-cover-feature";
import { installSerialCoverSettings } from "./serial-cover-settings";

export default class AnimeListPluginEntry extends AnimeListPlugin {
  async onload(): Promise<void> {
    await super.onload();
    installSearchEnhancements(this);
    installSearchPagination(this);
    installProgressUi(this);
    installRatingUi(this);
    installAdditionalProgressUnitsUi(this);
    installSerialEntryCovers(this);
    installSerialCoverSettings(this);
    await installMasterpieceLabels(this);
    installScoreDashboard(this);
  }
}
