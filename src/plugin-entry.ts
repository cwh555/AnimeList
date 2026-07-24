import "./search-pagination";
import "./progress-ui";
import AnimeListPlugin from "./main";
import { installRatingUi } from "./rating-ui";

export default class AnimeListPluginEntry extends AnimeListPlugin {
  async onload(): Promise<void> {
    await super.onload();
    installRatingUi(this);
  }
}
