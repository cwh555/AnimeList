import { MarkdownRenderChild, Menu, Notice, type MarkdownPostProcessorContext } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import type { ImageSectionAddResult, ImageSectionAssetInput, ImageSectionService } from "../data/image-section-service";
import { imageAssetFromFile } from "../data/image-section-service";
import {
  isSupportedImageName,
  parseImageSectionSource,
  type ImageSectionLocator,
} from "../domain/image-section";
import { imageSectionText } from "../image-section-text";
import { AddImageSectionModal, DeleteImageSectionModal } from "./image-section-modal";
import { copyImageToClipboard } from "./image-clipboard";
import { ImageLightboxModal } from "./image-lightbox";
import { errorMessage, makeEl, setAnimeListIcon } from "./ui-helpers";
import { captureViewportAnchor } from "./viewport-anchor";

function eventTargetElement(event: Event): Element | null {
  const target = event.target as { closest?: (selector: string) => Element | null } | null;
  return target && typeof target.closest === "function" ? target as Element : null;
}

function isInteractiveTarget(target: Element | null): boolean {
  return Boolean(target?.closest("button, a, input, textarea, select, [role='button']"));
}

export class ImageSectionRenderChild extends MarkdownRenderChild {
  private source: string;
  private interactionsBound = false;
  private lineHint: number | undefined;
  private expanded = false;
  private galleryCollapsible = false;
  private selectionMode = false;
  private readonly selectedPaths = new Set<string>();
  private selectionDeleteButton: HTMLButtonElement | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly host: AnimeListFeatureHost,
    private readonly service: ImageSectionService,
    source: string,
    private readonly context: MarkdownPostProcessorContext,
  ) {
    super(containerEl);
    this.source = source;
  }

  onload(): void {
    this.lineHint = this.context.getSectionInfo(this.containerEl)?.lineStart;
    this.render();
    this.registerDomEvent(document, "click", () => this.closeMenus());
  }

  private locator(): ImageSectionLocator {
    const section = this.context.getSectionInfo(this.containerEl);
    return {
      source: this.source,
      lineStart: section?.lineStart ?? this.lineHint,
      lineEnd: section?.lineEnd,
    };
  }

  private setSource(source: string): void {
    this.source = source;
    this.selectionMode = false;
    this.selectedPaths.clear();
    this.render();
  }

  private applyAddResult(result: ImageSectionAddResult): void {
    if (result.duplicatesSkipped > 0) {
      new Notice(imageSectionText("duplicatesSkipped", { count: result.duplicatesSkipped }));
    }
    this.setSource(result.source);
  }

  private openAddModal(): void {
    new AddImageSectionModal(this.host.app, this.service, async (assets) => {
      const result = await this.service.addAssets(this.context.sourcePath, this.locator(), assets);
      this.applyAddResult(result);
    }).open();
  }

  private async addFiles(files: readonly File[]): Promise<void> {
    const accepted = files.filter((file) => isSupportedImageName(file.name, file.type));
    if (!accepted.length) return;
    try {
      const assets: ImageSectionAssetInput[] = await Promise.all(accepted.map((file) => imageAssetFromFile(file)));
      const result = await this.service.addAssets(this.context.sourcePath, this.locator(), assets);
      this.applyAddResult(result);
    } catch (error) {
      new Notice(imageSectionText("addFailed", { error: errorMessage(error) }));
    }
  }

  private closeMenus(except?: HTMLElement): void {
    for (const menu of this.containerEl.querySelectorAll<HTMLElement>(".al-image-item-menu.is-open")) {
      if (menu !== except) menu.removeClass("is-open");
    }
  }

  private deletePaths(paths: readonly string[]): void {
    if (!paths.length) return;
    new DeleteImageSectionModal(this.host.app, async () => {
      const next = await this.service.removeMany(this.context.sourcePath, this.locator(), paths);
      this.setSource(next);
    }, paths.length).open();
  }

  private openLightbox(path: string): void {
    const paths = parseImageSectionSource(this.source);
    const index = Math.max(0, paths.indexOf(path));
    new ImageLightboxModal(this.host.app, this.service, this.context.sourcePath, paths, index).open();
  }

  private async copyPath(path: string): Promise<void> {
    try {
      await copyImageToClipboard(this.service, this.context.sourcePath, path);
      new Notice(imageSectionText("copied"));
    } catch (error) {
      new Notice(imageSectionText("copyFailed", { error: errorMessage(error) }));
    }
  }

  private showImageContextMenu(event: MouseEvent, path: string): void {
    const menu = new Menu();
    menu.addItem((item) => item
      .setTitle(imageSectionText("copyImage"))
      .setIcon("copy")
      .onClick(() => void this.copyPath(path)));
    menu.addItem((item) => item
      .setTitle(imageSectionText("setCover"))
      .setIcon("image")
      .onClick(() => void this.service.setAsCover(this.context.sourcePath, path).catch((error) => {
        new Notice(imageSectionText("coverFailed", { error: errorMessage(error) }));
      })));
    menu.addItem((item) => item
      .setTitle(imageSectionText("delete"))
      .setIcon("trash")
      .setWarning(true)
      .onClick(() => this.deletePaths([path])));
    menu.showAtMouseEvent(event);
  }

  private createMenu(path: string): HTMLElement {
    const wrap = makeEl("div", "al-image-item-actions");
    const trigger = makeEl("button", "al-image-menu-trigger");
    trigger.type = "button";
    trigger.setAttribute("aria-label", "Image actions");
    trigger.textContent = "⋯";
    const menu = makeEl("div", "al-image-item-menu");

    const copy = makeEl("button", "");
    copy.type = "button";
    setAnimeListIcon(copy, "copy");
    copy.appendChild(makeEl("span", "", imageSectionText("copyImage")));
    copy.addEventListener("click", (event) => {
      event.stopPropagation();
      menu.removeClass("is-open");
      void this.copyPath(path);
    });

    const cover = makeEl("button", "");
    cover.type = "button";
    setAnimeListIcon(cover, "image");
    cover.appendChild(makeEl("span", "", imageSectionText("setCover")));
    cover.addEventListener("click", (event) => {
      event.stopPropagation();
      menu.removeClass("is-open");
      void this.service.setAsCover(this.context.sourcePath, path).catch((error) => {
        new Notice(imageSectionText("coverFailed", { error: errorMessage(error) }));
      });
    });

    const remove = makeEl("button", "al-image-delete-action");
    remove.type = "button";
    setAnimeListIcon(remove, "trash");
    remove.appendChild(makeEl("span", "", imageSectionText("delete")));
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      menu.removeClass("is-open");
      this.deletePaths([path]);
    });

    menu.append(copy, cover, remove);
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = !menu.classList.contains("is-open");
      this.closeMenus(menu);
      menu.toggleClass("is-open", open);
    });
    wrap.append(trigger, menu);
    return wrap;
  }

  private updateSelectionButton(): void {
    if (!this.selectionDeleteButton) return;
    const count = this.selectedPaths.size;
    this.selectionDeleteButton.disabled = count === 0;
    this.selectionDeleteButton.textContent = imageSectionText("deleteSelected", { count });
  }

  private toggleSelection(path: string, item: HTMLElement, marker: HTMLElement): void {
    const selected = !this.selectedPaths.has(path);
    if (selected) this.selectedPaths.add(path);
    else this.selectedPaths.delete(path);
    if (!selected && this.selectedPaths.size === 0) {
      this.selectionMode = false;
      this.render();
      return;
    }
    item.toggleClass("is-selected", selected);
    item.setAttribute("aria-pressed", String(selected));
    marker.toggleClass("is-selected", selected);
    marker.textContent = selected ? "✓" : "";
    this.updateSelectionButton();
  }

  private enterSelectionFromImage(path: string): void {
    this.selectionMode = true;
    this.selectedPaths.clear();
    this.selectedPaths.add(path);
    this.render();
  }

  private createImage(path: string): HTMLElement {
    const item = makeEl("div", `al-image-item${this.selectionMode ? " is-selecting" : ""}`);
    const resolved = this.service.resolve(path, this.context.sourcePath);
    if (resolved.resourcePath) {
      const image = makeEl("img");
      image.src = resolved.thumbnailSources?.src || resolved.resourcePath;
      if (resolved.thumbnailSources?.srcset) {
        image.srcset = resolved.thumbnailSources.srcset;
        image.sizes = "(max-width: 620px) 50vw, 25vw";
      }
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.draggable = false;
      item.appendChild(image);
    } else {
      const missing = makeEl("div", "al-image-missing");
      const icon = makeEl("div", "al-image-missing-icon");
      setAnimeListIcon(icon, "image-off");
      missing.append(icon, makeEl("span", "", imageSectionText("missing")));
      item.appendChild(missing);
    }

    if (this.selectionMode) {
      const selected = this.selectedPaths.has(path);
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-pressed", String(selected));
      item.setAttribute("aria-label", imageSectionText("selectImage"));
      item.toggleClass("is-selected", selected);
      const marker = makeEl("span", `al-image-selection-marker${selected ? " is-selected" : ""}`, selected ? "✓" : "");
      item.appendChild(marker);
      const toggle = (): void => this.toggleSelection(path, item, marker);
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle();
      });
      item.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        toggle();
      });
    } else {
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", imageSectionText("openImage"));
      item.addEventListener("click", (event) => {
        if (eventTargetElement(event)?.closest(".al-image-item-actions")) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          this.enterSelectionFromImage(path);
          return;
        }
        this.openLightbox(path);
      });
      item.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "c") {
          event.preventDefault();
          event.stopPropagation();
          void this.copyPath(path);
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        this.openLightbox(path);
      });
      item.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.showImageContextMenu(event, path);
      });
      item.appendChild(this.createMenu(path));
    }
    return item;
  }

  private renderGallery(paths: readonly string[]): void {
    const viewport = makeEl("div", `al-image-gallery-viewport${this.expanded ? " is-expanded" : ""}`);
    const gallery = makeEl("div", "al-image-masonry");
    for (const path of paths) gallery.appendChild(this.createImage(path));
    viewport.appendChild(gallery);

    const toggle = makeEl("button", "al-image-expand-button");
    toggle.type = "button";
    const updateToggle = (): void => {
      if (!this.expanded) {
        this.galleryCollapsible = viewport.scrollHeight > viewport.clientHeight + 2;
      }
      toggle.hidden = !this.galleryCollapsible;
      toggle.textContent = imageSectionText(this.expanded ? "showLess" : "showAll");
    };
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const expanding = !this.expanded;
      const anchor = expanding ? captureViewportAnchor(this.containerEl) : null;
      toggle.blur();
      this.expanded = expanding;
      viewport.toggleClass("is-expanded", this.expanded);
      updateToggle();
      if (!this.expanded) viewport.scrollTop = 0;
      if (anchor) {
        anchor.restore();
        anchor.stabilize();
        for (const image of gallery.querySelectorAll<HTMLImageElement>("img")) {
          if (image.complete) continue;
          image.addEventListener("load", () => {
            window.requestAnimationFrame(() => anchor.restore());
          }, { once: true });
        }
      }
    });

    for (const image of gallery.querySelectorAll<HTMLImageElement>("img")) {
      if (!image.complete) image.addEventListener("load", updateToggle, { once: true });
    }
    window.requestAnimationFrame(updateToggle);
    this.containerEl.append(viewport, toggle);
  }

  private bindDropAndPaste(): void {
    if (this.interactionsBound) return;
    this.interactionsBound = true;
    this.containerEl.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    this.containerEl.addEventListener("mousedown", (event) => {
      if (!isInteractiveTarget(eventTargetElement(event))) return;
      event.preventDefault();
      event.stopPropagation();
    });
    this.containerEl.addEventListener("click", (event) => {
      if (event.defaultPrevented || isInteractiveTarget(eventTargetElement(event))) return;
      this.containerEl.focus({ preventScroll: true });
    });
    this.containerEl.addEventListener("dragover", (event) => {
      if (![...(event.dataTransfer?.items ?? [])].some((item) => item.kind === "file")) return;
      event.preventDefault();
      this.containerEl.addClass("is-dragging");
    });
    this.containerEl.addEventListener("dragleave", () => this.containerEl.removeClass("is-dragging"));
    this.containerEl.addEventListener("drop", (event) => {
      const files = [...(event.dataTransfer?.files ?? [])];
      if (!files.length) return;
      event.preventDefault();
      this.containerEl.removeClass("is-dragging");
      void this.addFiles(files);
    });
    this.containerEl.addEventListener("paste", (event) => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (!files.length) return;
      event.preventDefault();
      void this.addFiles(files);
    });
  }

  private renderToolbar(paths: readonly string[]): void {
    const toolbar = makeEl("div", "al-image-section-toolbar");
    if (this.selectionMode) {
      const cancel = makeEl("button", "al-image-selection-cancel", imageSectionText("cancelSelection"));
      cancel.type = "button";
      cancel.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.selectionMode = false;
        this.selectedPaths.clear();
        this.render();
      });
      const confirm = makeEl("button", "al-image-selection-delete");
      confirm.type = "button";
      confirm.disabled = true;
      confirm.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.deletePaths([...this.selectedPaths]);
      });
      this.selectionDeleteButton = confirm;
      this.updateSelectionButton();
      toolbar.append(cancel, confirm);
    } else {
      this.selectionDeleteButton = null;
      const add = makeEl("button", "al-image-add-button");
      add.type = "button";
      add.setAttribute("aria-label", imageSectionText("addImages"));
      add.title = imageSectionText("addImages");
      setAnimeListIcon(add, "plus");
      add.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openAddModal();
      });
      toolbar.appendChild(add);
      if (paths.length) {
        const remove = makeEl("button", "al-image-manage-delete-button", imageSectionText("delete"));
        remove.type = "button";
        setAnimeListIcon(remove, "trash-2");
        remove.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.selectionMode = true;
          this.selectedPaths.clear();
          this.render();
        });
        toolbar.appendChild(remove);
      }
    }
    this.containerEl.appendChild(toolbar);
  }

  render(): void {
    this.containerEl.replaceChildren();
    this.containerEl.addClass("animelist-image-section");
    this.containerEl.toggleClass("is-selecting", this.selectionMode);
    this.containerEl.tabIndex = 0;

    const paths = parseImageSectionSource(this.source);
    this.renderToolbar(paths);
    if (!paths.length) {
      const empty = makeEl("button", "al-image-empty");
      empty.type = "button";
      const icon = makeEl("div", "al-image-empty-icon");
      setAnimeListIcon(icon, "image-plus");
      empty.append(
        icon,
        makeEl("span", "", imageSectionText("noImages")),
        makeEl("strong", "", `+ ${imageSectionText("addImages")}`),
      );
      empty.addEventListener("click", () => this.openAddModal());
      this.containerEl.appendChild(empty);
    } else {
      this.renderGallery(paths);
    }
    this.bindDropAndPaste();
  }
}
