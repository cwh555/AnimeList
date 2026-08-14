import { MarkdownRenderChild, Menu, Notice, type MarkdownPostProcessorContext } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import type { ImageSectionService } from "../data/image-section-service";
import type { MomentsService } from "../data/moments-service";
import { parseMomentsSource, type MomentItem, type MomentsLocator } from "../domain/moments";
import { momentsText } from "../moments-text";
import { copyImageToClipboard, copyImagesToClipboard, copyTextToClipboard } from "./image-clipboard";
import { ImageLightboxModal } from "./image-lightbox";
import { DeleteMomentModal, MomentEditorModal } from "./moments-modal";
import { errorMessage, makeEl, setAnimeListIcon } from "./ui-helpers";

function targetElement(event: Event): Element | null {
  const target = event.target as { closest?: (selector: string) => Element | null } | null;
  return target && typeof target.closest === "function" ? target as Element : null;
}

function interactive(target: Element | null): boolean {
  return Boolean(target?.closest("button, a, input, textarea, select, [role='button']"));
}

export class MomentsRenderChild extends MarkdownRenderChild {
  private source: string;
  private lineHint: number | undefined;

  constructor(
    containerEl: HTMLElement,
    private readonly host: AnimeListFeatureHost,
    private readonly momentsService: MomentsService,
    private readonly imageService: ImageSectionService,
    source: string,
    private readonly context: MarkdownPostProcessorContext,
  ) {
    super(containerEl);
    this.source = source;
  }

  onload(): void {
    this.lineHint = this.context.getSectionInfo(this.containerEl)?.lineStart;
    this.containerEl.addEventListener("mousedown", (event) => {
      if (!interactive(targetElement(event))) return;
      event.preventDefault();
      event.stopPropagation();
    });
    this.render();
  }

  private locator(): MomentsLocator {
    const section = this.context.getSectionInfo(this.containerEl);
    return {
      source: this.source,
      lineStart: section?.lineStart ?? this.lineHint,
      lineEnd: section?.lineEnd,
    };
  }

  private setSource(source: string): void {
    this.source = source;
    this.render();
  }

  private openAdd(): void {
    new MomentEditorModal(this.host.app, this.imageService, this.context.sourcePath, null, async (input) => {
      const result = await this.momentsService.addMoment(this.context.sourcePath, this.locator(), input);
      if (result.duplicatesSkipped) new Notice(momentsText("duplicatesSkipped", { count: result.duplicatesSkipped }));
      this.setSource(result.source);
    }).open();
  }

  private openEdit(moment: MomentItem): void {
    new MomentEditorModal(this.host.app, this.imageService, this.context.sourcePath, moment, async (input) => {
      const result = await this.momentsService.editMoment(this.context.sourcePath, this.locator(), moment.id, input);
      if (result.duplicatesSkipped) new Notice(momentsText("duplicatesSkipped", { count: result.duplicatesSkipped }));
      this.setSource(result.source);
    }).open();
  }

  private deleteMoment(moment: MomentItem): void {
    new DeleteMomentModal(this.host.app, async () => {
      const source = await this.momentsService.deleteMoment(this.context.sourcePath, this.locator(), moment.id);
      this.setSource(source);
    }).open();
  }

  private async copyText(moment: MomentItem): Promise<void> {
    try {
      await copyTextToClipboard(moment.text);
      new Notice(momentsText("copiedText"));
    } catch (error) {
      new Notice(momentsText("copyFailed", { error: errorMessage(error) }));
    }
  }

  private async copyImages(moment: MomentItem): Promise<void> {
    try {
      await copyImagesToClipboard(this.imageService, this.context.sourcePath, moment.images);
      new Notice(momentsText("copiedImages"));
    } catch (error) {
      new Notice(momentsText("copyFailed", { error: errorMessage(error) }));
    }
  }

  private showMomentMenu(event: MouseEvent, moment: MomentItem): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("Edit").setIcon("pencil").onClick(() => this.openEdit(moment)));
    menu.addItem((item) => item.setTitle("Copy text").setIcon("copy").onClick(() => void this.copyText(moment)));
    menu.addItem((item) => item.setTitle("Copy images").setIcon("images").onClick(() => void this.copyImages(moment)));
    menu.addItem((item) => item.setTitle("Delete").setIcon("trash").setWarning(true).onClick(() => this.deleteMoment(moment)));
    menu.showAtMouseEvent(event);
  }

  private showImageMenu(event: MouseEvent, path: string): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("Copy image").setIcon("copy").onClick(() => {
      void copyImageToClipboard(this.imageService, this.context.sourcePath, path)
        .then(() => new Notice(momentsText("copiedImages")))
        .catch((error) => new Notice(momentsText("copyFailed", { error: errorMessage(error) })));
    }));
    menu.showAtMouseEvent(event);
  }

  private openLightbox(moment: MomentItem, path: string): void {
    const index = Math.max(0, moment.images.indexOf(path));
    new ImageLightboxModal(this.host.app, this.imageService, this.context.sourcePath, moment.images, index).open();
  }

  private renderMoment(moment: MomentItem): HTMLElement {
    const card = makeEl("article", "al-moment-card");
    card.dataset.momentId = moment.id;

    const head = makeEl("div", "al-moment-head");
    const text = makeEl("div", "al-moment-text", moment.text);
    const actions = makeEl("button", "al-moment-actions");
    actions.type = "button";
    actions.setAttribute("aria-label", "Moment actions");
    actions.textContent = "⋯";
    actions.addEventListener("click", (event) => {
      event.stopPropagation();
      this.showMomentMenu(event, moment);
    });
    head.append(text, actions);
    card.appendChild(head);

    const row = makeEl("div", "al-moment-image-row");
    row.setAttribute("role", "list");
    for (const path of moment.images) {
      const frame = makeEl("button", "al-moment-image");
      frame.type = "button";
      frame.setAttribute("role", "listitem");
      frame.setAttribute("aria-label", "Open image");
      const resolved = this.imageService.resolve(path, this.context.sourcePath);
      if (resolved.resourcePath) {
        const image = makeEl("img");
        image.src = resolved.thumbnailSources?.src || resolved.resourcePath;
        if (resolved.thumbnailSources?.srcset) {
          image.srcset = resolved.thumbnailSources.srcset;
          image.sizes = "360px";
        }
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.draggable = false;
        frame.appendChild(image);
      } else {
        const missing = makeEl("div", "al-moment-image-missing");
        setAnimeListIcon(missing, "image-off");
        missing.appendChild(makeEl("span", "", momentsText("missingImage")));
        frame.appendChild(missing);
      }
      frame.addEventListener("click", (event) => {
        event.stopPropagation();
        this.openLightbox(moment, path);
      });
      frame.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.showImageMenu(event, path);
      });
      row.appendChild(frame);
    }
    card.appendChild(row);
    return card;
  }

  private render(): void {
    this.containerEl.replaceChildren();
    this.containerEl.addClass("animelist-moments-section");

    const toolbar = makeEl("div", "al-moments-toolbar");
    const add = makeEl("button", "al-moments-add");
    add.type = "button";
    add.setAttribute("aria-label", "Add moment");
    setAnimeListIcon(add, "plus");
    add.addEventListener("click", (event) => { event.stopPropagation(); this.openAdd(); });
    toolbar.appendChild(add);
    this.containerEl.appendChild(toolbar);

    const moments = parseMomentsSource(this.source);
    if (!moments.length) {
      this.containerEl.appendChild(makeEl("div", "al-moments-empty", momentsText("empty")));
      return;
    }
    const list = makeEl("div", "al-moments-list");
    moments.forEach((moment) => list.appendChild(this.renderMoment(moment)));
    this.containerEl.appendChild(list);
  }
}
