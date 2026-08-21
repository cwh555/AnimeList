import { Menu, Modal, Notice } from "obsidian";
import type { ImageSectionService } from "../data/image-section-service";
import { imageSectionText } from "../features/image-sections/text";
import { copyImageToClipboard } from "./image-clipboard";
import { errorMessage, makeEl, setAnimeListIcon } from "./ui-helpers";

export interface ImageLightboxEntry {
  path: string;
  sourcePath: string;
}

export function imageLightboxEntries(sourcePath: string, paths: readonly string[]): ImageLightboxEntry[] {
  return paths.map((path) => ({ path, sourcePath }));
}

export class ImageLightboxModal extends Modal {
  private index: number;

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly service: ImageSectionService,
    private readonly entries: readonly ImageLightboxEntry[],
    startIndex: number,
  ) {
    super(app);
    this.index = Math.max(0, Math.min(entries.length - 1, startIndex));
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-image-lightbox");
    this.modalEl.addEventListener("keydown", this.handleKeydown);
    this.render();
  }

  onClose(): void {
    this.modalEl.removeEventListener("keydown", this.handleKeydown);
    this.contentEl.replaceChildren();
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "c") {
      event.preventDefault();
      void this.copyCurrent();
      return;
    }
    if (event.key === "ArrowLeft" && this.entries.length > 1) {
      event.preventDefault();
      this.move(-1);
    } else if (event.key === "ArrowRight" && this.entries.length > 1) {
      event.preventDefault();
      this.move(1);
    }
  };

  private move(delta: number): void {
    if (!this.entries.length) return;
    this.index = (this.index + delta + this.entries.length) % this.entries.length;
    this.render();
  }

  private async copyCurrent(): Promise<void> {
    const entry = this.entries[this.index];
    if (!entry) return;
    try {
      await copyImageToClipboard(this.service, entry.sourcePath, entry.path);
      new Notice(imageSectionText("copied"));
    } catch (error) {
      new Notice(imageSectionText("copyFailed", { error: errorMessage(error) }));
    }
  }

  private render(): void {
    this.contentEl.replaceChildren();
    const entry = this.entries[this.index];
    if (!entry) return;
    const resolved = this.service.resolve(entry.path, entry.sourcePath);
    if (!resolved.resourcePath) {
      this.contentEl.appendChild(makeEl("div", "al-image-lightbox-missing", imageSectionText("missing")));
      return;
    }

    const stage = makeEl("div", "al-image-lightbox-stage");
    const image = makeEl("img", "al-image-lightbox-image");
    image.src = resolved.resourcePath;
    image.alt = "";
    image.draggable = false;
    image.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = new Menu();
      menu.addItem((item) => item
        .setTitle(imageSectionText("copyImage"))
        .setIcon("copy")
        .onClick(() => void this.copyCurrent()));
      menu.showAtMouseEvent(event);
    });
    stage.appendChild(image);

    if (this.entries.length > 1) {
      const previous = makeEl("button", "al-image-lightbox-nav is-previous");
      previous.type = "button";
      previous.setAttribute("aria-label", imageSectionText("previousImage"));
      setAnimeListIcon(previous, "chevron-left");
      previous.addEventListener("click", (event) => { event.stopPropagation(); this.move(-1); });
      const next = makeEl("button", "al-image-lightbox-nav is-next");
      next.type = "button";
      next.setAttribute("aria-label", imageSectionText("nextImage"));
      setAnimeListIcon(next, "chevron-right");
      next.addEventListener("click", (event) => { event.stopPropagation(); this.move(1); });
      stage.append(previous, next);
    }

    const counter = makeEl("div", "al-image-lightbox-counter", `${this.index + 1} / ${this.entries.length}`);
    this.contentEl.append(stage, counter);
  }
}
