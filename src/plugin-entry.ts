import "./search-pagination";
import "./progress-ui";
import AnimeListPlugin from "./main";
import { installAdditionalProgressUnitsUi } from "./additional-progress-units-ui";
import { installRatingUi } from "./rating-ui";
import { installClassificationUi } from "./classification-ui";
import { installClassificationMigration } from "./classification-migration";
import { installClassificationSettings } from "./classification-settings";

export default class AnimeListPluginEntry extends AnimeListPlugin {
  async onload(): Promise<void> {
    await super.onload();
    installRatingUi(this);
    installAdditionalProgressUnitsUi(this);
    installClassificationUi(this);
    installClassificationMigration(this);
    installClassificationSettings(this);
  }
}
