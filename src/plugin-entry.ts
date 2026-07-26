import "./search-pagination";
import "./progress-ui";
import AnimeListPlugin from "./main";
import { installAdditionalProgressUnitsUi } from "./additional-progress-units-ui";
import { installMasterpieceEditUi } from "./masterpiece-edit-ui";
import { installMasterpieceGroupedView } from "./masterpiece-grouped-view";
import { installMasterpieceOperationUi } from "./masterpiece-operation-ui";
import { installMasterpieceLabels } from "./masterpiece-ui";
import { installRatingUi } from "./rating-ui";
import { installScoreDashboard } from "./score-dashboard-feature";
import { installSerialEntryCovers } from "./serial-cover-feature";
import { installSerialCoverPickerEvents } from "./serial-cover-picker-events";
import { installSerialCoverSettings } from "./serial-cover-settings";

export default class AnimeListPluginEntry extends AnimeListPlugin {
  async onload(): Promise<void> {
    await super.onload();
    installRatingUi(this);
    installAdditionalProgressUnitsUi(this);
    installSerialEntryCovers(this);
    installSerialCoverPickerEvents(this);
    installSerialCoverSettings(this);
    await installMasterpieceLabels(this);
    installMasterpieceOperationUi(this);
    installMasterpieceEditUi(this);
    installMasterpieceGroupedView(this);
    installScoreDashboard(this);
  }
}
