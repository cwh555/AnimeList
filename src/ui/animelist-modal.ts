import { Modal, type App } from "obsidian";
import { isolateHorizontalSwipeSurface } from "./mobile-swipe-isolation";

/** Keep Obsidian sidebar swipe handling outside AnimeList modal controls. */
export class AnimeListModal extends Modal {
  constructor(app: App) {
    super(app);
    if (typeof this.modalEl?.setAttribute === "function") {
      isolateHorizontalSwipeSurface(this.modalEl);
    }
  }
}
