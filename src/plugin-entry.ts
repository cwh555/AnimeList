import "./search-pagination";
import "./progress-ui";
import AnimeListPlugin from "./main";
import { installAdditionalProgressUnitsUi } from "./additional-progress-units-ui";
import { installMasterpieceEditUi } from "./masterpiece-edit-ui";
import { installMasterpieceGroupedView } from "./masterpiece-grouped-view";
import { installMasterpieceLabels } from "./masterpiece-ui";
import { installRatingUi } from "./rating-ui";

export default class AnimeListPluginEntry extends AnimeListPlugin {
  async onload(): Promise<void> {
    await super.onload();
    installRatingUi(this);
    installAdditionalProgressUnitsUi(this);
    await installMasterpieceLabels(this);
    installMasterpieceEditUi(this);
    installMasterpieceGroupedView(this);
  }
}
