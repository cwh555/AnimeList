import { MarkdownRenderChild, Menu, Notice, type MarkdownPostProcessorContext } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import type { ImageSectionAddResult, ImageSectionAssetInput, ImageSectionService } from "../data/image-section-service";
import { imageAssetFromFile } from "../data/image-section-service";
import {
  isSupportedImageName,
  parseImageSectionSource,
  type ImageSectionLocator,
} from "../domain/image-section";
import {
  DEFAULT_IMAGE_SECTION_COLUMNS,
  effectiveImageSectionColumns,
  imageSectionColumnBuckets,
  normalizeImageSectionColumns,
  parseImageSectionColumns,
} from "../domain/image-section-layout";
import {
  reorderImageSectionPaths,
  type ImageSectionDropPlacement,
  type ImageSectionStateUpdate,
} from "../domain/image-section-order";
import { imageSectionText } from "../features/image-sections/text";
import { AddImageSectionModal, DeleteImageSectionModal } from "./image-section-modal";
import { copyImageToClipboard } from "./image-clipboard";
import { ImageLightboxModal } from "./image-lightbox";
import { armPointerDrag, type PointerDragPoint } from "./pointer-drag";
import { errorMessage, makeEl, setAnimeListIcon } from "./ui-helpers";
import { captureScrollPosition, captureViewportAnchor } from "./viewport-anchor";

function eventTargetElement(event: Event): Element | null {
  const target = event.target as { closest?: (selector: string) => Element | null } | null;
  return target && typeof target.closest === "function" ? target as Element : null;
}

function isInteractiveTarget(target: Element | null): boolean {
  return Boolean(target?.closest("button, a, input, textarea, select, [role='button']"));
}

interface ImagePointerDropTarget {
  renderer: ImageSectionRenderChild;
  path: string | null;
  placement: ImageSectionDropPlacement;
}

interface ActiveImagePointerDrag {
  source: ImageSectionRenderChild;
  path: string;
  target: ImagePointerDropTarget | null;
}

const imageSectionRenderers = new WeakMap<HTMLElement, ImageSectionRenderChild>();
let activeImageDrag: ActiveImagePointerDrag | null = null;

function clearImageDropIndicators(): void {
  for (const item of document.querySelectorAll<HTMLElement>(
    ".al-image-item.is-drop-before, .al-image-item.is-drop-after",
  )) {
    item.removeClass("is-drop-before", "is-drop-after");
  }
  for (const section of document.querySelectorAll<HTMLElement>(".animelist-image-section.is-image-drag-target")) {
    section.removeClass("is-image-drag-target");
  }
}

export class ImageSectionRenderChild extends MarkdownRenderChild {
  private source: string;
  private interactionsBound = false;
  private lineHint: number | undefined;
  private lineHintAuthoritative = false;
  private expanded = false;
  private galleryCollapsible = false;
  private selectionMode = false;
  private readonly selectedPaths = new Set<string>();
  private selectionDeleteButton: HTMLButtonElement | null = null;
  private preferredColumns = DEFAULT_IMAGE_SECTION_COLUMNS;
  private galleryRelayout: (() => void) | null = null;
  private galleryPaths: string[] = [];
  private readonly imageElements = new Map<string, HTMLElement>();

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
    const section = this.context.getSectionInfo(this.containerEl);
    this.lineHint = section?.lineStart;
    this.preferredColumns = parseImageSectionColumns(section?.text);
    imageSectionRenderers.set(this.containerEl, this);
    this.render();
    this.registerDomEvent(document, "click", () => this.closeMenus());
  }

  onunload(): void {
    this.galleryRelayout = null;
    this.galleryPaths = [];
    this.imageElements.clear();
    imageSectionRenderers.delete(this.containerEl);
    if (activeImageDrag?.source === this) activeImageDrag = null;
    clearImageDropIndicators();
  }

  private locator(): ImageSectionLocator {
    const section = this.context.getSectionInfo(this.containerEl);
    return {
      source: this.source,
      lineStart: this.lineHintAuthoritative ? this.lineHint : section?.lineStart ?? this.lineHint,
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

  private dropPlacement(item: HTMLElement, clientY: number): ImageSectionDropPlacement {
    const rect = item.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2 ? "before" : "after";
  }

  private markDropTarget(item: HTMLElement | null, placement: ImageSectionDropPlacement): void {
    clearImageDropIndicators();
    this.containerEl.addClass("is-image-drag-target");
    if (!item) return;
    item.addClass(placement === "before" ? "is-drop-before" : "is-drop-after");
  }

  private pointerDropTarget(point: PointerDragPoint): ImagePointerDropTarget | null {
    const hit = document.elementFromPoint(point.clientX, point.clientY) as HTMLElement | null;
    const section = hit?.closest<HTMLElement>(".animelist-image-section") ?? null;
    if (!section) return null;
    const renderer = imageSectionRenderers.get(section);
    if (!renderer) return null;
    const item = hit?.closest<HTMLElement>(".al-image-item[data-image-path]") ?? null;
    if (item && section.contains(item)) {
      const path = item.dataset.imagePath ?? "";
      if (!path) return null;
      return { renderer, path, placement: renderer.dropPlacement(item, point.clientY) };
    }
    const galleryTarget = hit?.closest(
      ".al-image-gallery-viewport, .al-image-masonry, .al-image-masonry-column, .al-image-empty",
    );
    return galleryTarget && section.contains(galleryTarget)
      ? { renderer, path: null, placement: "append" }
      : null;
  }

  private updatePointerDropTarget(point: PointerDragPoint): void {
    if (!activeImageDrag) return;
    const target = this.pointerDropTarget(point);
    activeImageDrag.target = target;
    if (!target) {
      clearImageDropIndicators();
      return;
    }
    const item = target.path
      ? target.renderer.containerEl.querySelector<HTMLElement>(
        `.al-image-item[data-image-path="${CSS.escape(target.path)}"]`,
      )
      : null;
    target.renderer.markDropTarget(item, target.placement);
  }

  private applyGalleryPaths(nextPaths: readonly string[], renderEmpty = true): void {
    const alreadyApplied = Boolean(this.galleryRelayout)
      && nextPaths.length === this.galleryPaths.length
      && nextPaths.every((path, index) => path === this.galleryPaths[index] && this.imageElements.has(path));
    if (alreadyApplied) return;
    if (!this.galleryRelayout || !this.galleryPaths.length || (!nextPaths.length && renderEmpty)) {
      this.galleryPaths = [...nextPaths];
      this.render();
      return;
    }
    const nextSet = new Set(nextPaths);
    for (const [path, element] of this.imageElements) {
      if (nextSet.has(path)) continue;
      element.remove();
      this.imageElements.delete(path);
    }
    for (const path of nextPaths) {
      if (!this.imageElements.has(path)) this.imageElements.set(path, this.createImage(path));
    }
    this.galleryPaths = [...nextPaths];
    this.galleryRelayout();
  }

  private applyOrderedSectionState(update: ImageSectionStateUpdate): void {
    this.source = update.source;
    this.lineHint = update.lineStart;
    this.lineHintAuthoritative = true;
    window.setTimeout(() => { this.lineHintAuthoritative = false; }, 250);
    this.selectionMode = false;
    this.selectedPaths.clear();
    this.applyGalleryPaths(parseImageSectionSource(update.source));
  }

  private optimisticMovePaths(
    source: ImageSectionRenderChild,
    path: string,
    targetPath: string | null,
    placement: ImageSectionDropPlacement,
  ): { sourceBefore: string[]; targetBefore: string[]; changed: boolean } {
    const sourceBefore = [...source.galleryPaths];
    const targetBefore = source === this ? sourceBefore : [...this.galleryPaths];
    if (source === this) {
      const next = reorderImageSectionPaths(sourceBefore, path, targetPath ?? "", placement);
      const changed = next.some((entry, index) => entry !== sourceBefore[index]);
      if (changed) source.applyGalleryPaths(next);
      return { sourceBefore, targetBefore, changed };
    }

    const nextSource = sourceBefore.filter((entry) => entry !== path);
    const targetWithMoving = [...targetBefore.filter((entry) => entry !== path), path];
    const nextTarget = reorderImageSectionPaths(targetWithMoving, path, targetPath ?? "", placement);
    const changed = nextSource.length !== sourceBefore.length
      || nextTarget.some((entry, index) => entry !== targetBefore[index]);
    if (changed) {
      source.applyGalleryPaths(nextSource, false);
      this.applyGalleryPaths(nextTarget, false);
    }
    return { sourceBefore, targetBefore, changed };
  }

  private async handleInternalImageDrop(
    source: ImageSectionRenderChild,
    path: string,
    targetPath: string | null,
    placement: ImageSectionDropPlacement,
  ): Promise<void> {
    clearImageDropIndicators();
    if (source.context.sourcePath !== this.context.sourcePath) {
      new Notice(imageSectionText("crossNoteMoveUnsupported"));
      return;
    }
    const optimistic = this.optimisticMovePaths(source, path, targetPath, placement);
    if (!optimistic.changed) {
      source.containerEl.removeClass("is-image-drag-source");
      return;
    }
    try {
      const update = await this.service.moveAsset(
        this.context.sourcePath,
        source.locator(),
        this.locator(),
        path,
        targetPath ?? "",
        placement,
      );
      source.containerEl.removeClass("is-image-drag-source");
      if (source === this) {
        this.applyOrderedSectionState(update.sourceSection);
      } else {
        source.applyOrderedSectionState(update.sourceSection);
        this.applyOrderedSectionState(update.targetSection);
      }
    } catch (error) {
      source.applyGalleryPaths(optimistic.sourceBefore);
      if (source !== this) this.applyGalleryPaths(optimistic.targetBefore);
      new Notice(imageSectionText("moveFailed", { error: errorMessage(error) }));
    }
  }

  private canStartImagePointerDrag(item: HTMLElement, event: PointerEvent): boolean {
    if (this.selectionMode) return false;
    const target = event.target as Element | null;
    const handle = target?.closest(".al-image-drag-handle");
    if (event.pointerType !== "mouse") return Boolean(handle);
    if (handle) return true;
    const interactive = target?.closest("button, a, input, textarea, select");
    return !interactive || interactive === item;
  }

  private beginImagePointerDrag(item: HTMLElement, path: string, event: PointerEvent): void {
    if (!this.canStartImagePointerDrag(item, event)) return;
    activeImageDrag = { source: this, path, target: null };
    armPointerDrag({
      event,
      captureElement: item,
      dragElement: item,
      ghostClass: "al-image-drag-ghost",
      onStart: () => {
        this.containerEl.addClass("is-image-drag-source");
        this.closeMenus();
      },
      onMove: (point) => this.updatePointerDropTarget(point),
      onDrop: () => {
        const drag = activeImageDrag;
        activeImageDrag = null;
        this.containerEl.removeClass("is-image-drag-source");
        clearImageDropIndicators();
        if (!drag?.target) return;
        void drag.target.renderer.handleInternalImageDrop(
          drag.source,
          drag.path,
          drag.target.path,
          drag.target.placement,
        );
      },
      onCancel: () => {
        if (activeImageDrag?.source === this && activeImageDrag.path === path) activeImageDrag = null;
        this.containerEl.removeClass("is-image-drag-source");
        clearImageDropIndicators();
      },
    });
  }

  private createImage(path: string): HTMLElement {
    const item = makeEl("div", `al-image-item${this.selectionMode ? " is-selecting" : ""}`);
    item.dataset.imagePath = path;
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
        if (eventTargetElement(event)?.closest(".al-image-item-actions, .al-image-drag-handle")) return;
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
      const dragHandle = makeEl("button", "al-image-drag-handle");
      dragHandle.type = "button";
      dragHandle.setAttribute("aria-label", imageSectionText("dragImage"));
      dragHandle.title = imageSectionText("dragImage");
      setAnimeListIcon(dragHandle, "grip-vertical");
      dragHandle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      item.append(this.createMenu(path), dragHandle);
      item.addEventListener("pointerdown", (event) => this.beginImagePointerDrag(item, path, event));
    }
    return item;
  }

  private renderGallery(paths: readonly string[]): void {
    const viewport = makeEl("div", `al-image-gallery-viewport${this.expanded ? " is-expanded" : ""}`);
    const gallery = makeEl("div", "al-image-masonry");
    this.galleryPaths = [...paths];
    this.imageElements.clear();
    for (const path of paths) this.imageElements.set(path, this.createImage(path));
    const relayout = (): void => {
      const columns = effectiveImageSectionColumns(this.preferredColumns, gallery.clientWidth);
      gallery.style.setProperty("--al-image-columns", String(columns));
      const columnElements = imageSectionColumnBuckets(this.galleryPaths, columns).map((bucket) => {
        const column = makeEl("div", "al-image-masonry-column");
        for (const path of bucket) {
          const item = this.imageElements.get(path);
          if (item) column.appendChild(item);
        }
        return column;
      });
      gallery.replaceChildren(...columnElements);
    };
    this.galleryRelayout = relayout;
    relayout();
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
      const target = eventTargetElement(event);
      if (!isInteractiveTarget(target)) return;
      if (target?.closest(".al-image-item[draggable='true'], input[type='range']")) {
        event.stopPropagation();
        return;
      }
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
    this.containerEl.addEventListener("dragleave", (event) => {
      if (!this.containerEl.contains(event.relatedTarget as Node | null)) {
        this.containerEl.removeClass("is-dragging");
      }
    });
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

      const control = makeEl("label", "al-image-column-control");
      const labelText = makeEl("span", "al-image-column-label", imageSectionText("columnsLabel"));
      const range = makeEl("input");
      range.type = "range";
      range.min = "1";
      range.max = "6";
      range.step = "1";
      range.value = String(this.preferredColumns);
      range.setAttribute("aria-label", imageSectionText("columnsLabel"));
      const value = makeEl("output", "al-image-column-value", String(this.preferredColumns));
      let persistedColumns = this.preferredColumns;
      range.addEventListener("input", () => {
        // The browser may apply scroll anchoring when a lower column count
        // makes the masonry substantially taller. Anchor the control itself,
        // not just the outer scrollTop, so the slider stays under the pointer
        // throughout both directions of adjustment.
        const controlAnchor = captureViewportAnchor(range);
        this.preferredColumns = normalizeImageSectionColumns(range.value);
        value.value = String(this.preferredColumns);
        value.textContent = String(this.preferredColumns);
        this.galleryRelayout?.();
        controlAnchor.restore();
        controlAnchor.stabilize(4);
      });
      range.addEventListener("change", () => {
        const nextColumns = normalizeImageSectionColumns(range.value);
        // Persisting the fence metadata rewrites the note. Obsidian may replace
        // this Markdown render child as a result; keep the surrounding scroller
        // at the exact user-visible offset through that refresh.
        const scrollPosition = captureScrollPosition(this.containerEl);
        range.blur();
        scrollPosition.stabilize(12);
        void this.service.setColumns(this.context.sourcePath, this.locator(), nextColumns)
          .then((update) => {
            this.source = update.source;
            this.lineHint = update.lineStart;
            this.lineHintAuthoritative = true;
            window.setTimeout(() => { this.lineHintAuthoritative = false; }, 250);
            this.preferredColumns = nextColumns;
            persistedColumns = nextColumns;
            scrollPosition.restore();
            scrollPosition.stabilize(12);
          })
          .catch((error) => {
            this.preferredColumns = persistedColumns;
            range.value = String(persistedColumns);
            value.value = String(persistedColumns);
            value.textContent = String(persistedColumns);
            this.galleryRelayout?.();
            scrollPosition.restore();
            new Notice(imageSectionText("layoutFailed", { error: errorMessage(error) }));
          });
      });
      control.append(labelText, range, value);
      toolbar.appendChild(control);
    }
    this.containerEl.appendChild(toolbar);
  }

  render(): void {
    this.galleryRelayout = null;
    this.galleryPaths = [];
    this.imageElements.clear();
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
