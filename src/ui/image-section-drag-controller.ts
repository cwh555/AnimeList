import type { ImageSectionDropPlacement } from "../domain/image-section-order";
import { imageSectionText } from "../features/image-sections/text";
import { armPointerDrag, type PointerDragPoint } from "./pointer-drag";
import type { ImageSectionMoveParticipant } from "./image-section-move-coordinator";
import { makeEl } from "./ui-helpers";

export interface ImageSectionDragSurface {
  containerEl: HTMLElement;
  participant: ImageSectionMoveParticipant;
  signal: AbortSignal;
  canStart(item: HTMLElement, event: PointerEvent): boolean;
  closeMenus(): void;
  setDragging(active: boolean): void;
  drop(
    source: ImageSectionMoveParticipant,
    path: string,
    targetPath: string | null,
    placement: ImageSectionDropPlacement,
  ): void;
}

interface ImageSectionDropTarget {
  surface: ImageSectionDragSurface;
  item: HTMLElement | null;
  path: string | null;
  placement: ImageSectionDropPlacement;
}

interface ActiveImageDrag {
  source: ImageSectionDragSurface;
  item: HTMLElement;
  path: string;
  target: ImageSectionDropTarget | null;
}

interface DropPreview {
  target: ImageSectionDropTarget;
  placeholder: HTMLElement;
  highlightedItem: HTMLElement | null;
}

const dragSurfaces = new WeakMap<HTMLElement, ImageSectionDragSurface>();
let activeDrag: ActiveImageDrag | null = null;
let dropPreview: DropPreview | null = null;

function sameDropTarget(left: ImageSectionDropTarget | null, right: ImageSectionDropTarget | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.surface === right.surface
    && left.item === right.item
    && left.path === right.path
    && left.placement === right.placement;
}

function shortestColumn(container: HTMLElement): HTMLElement | null {
  const columns = [...container.querySelectorAll<HTMLElement>(".al-image-masonry-column")];
  if (!columns.length) return null;
  return columns.reduce((shortest, column) => (
    column.getBoundingClientRect().height < shortest.getBoundingClientRect().height ? column : shortest
  ));
}

function createDropPlaceholder(sourceItem: HTMLElement): HTMLElement {
  const rect = sourceItem.getBoundingClientRect();
  const placeholder = makeEl("div", "al-image-item al-image-drop-placeholder is-selected");
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.style.setProperty("height", `${Math.max(72, Math.round(rect.height))}px`);
  placeholder.appendChild(makeEl("div", "al-image-missing", imageSectionText("dropHere")));
  return placeholder;
}

function clearDropPreview(): void {
  if (!dropPreview) return;
  const { target, placeholder, highlightedItem } = dropPreview;
  placeholder.remove();
  highlightedItem?.removeClass("is-selected");
  target.surface.containerEl.removeClass("is-image-drag-target");
  if (activeDrag?.source !== target.surface) target.surface.setDragging(false);
  dropPreview = null;
}

function dropTargetFor(surface: ImageSectionDragSurface, point: PointerDragPoint): ImageSectionDropTarget | null {
  const document = surface.containerEl.ownerDocument;
  const hit = document.elementFromPoint(point.clientX, point.clientY) as HTMLElement | null;
  const section = hit?.closest<HTMLElement>(".animelist-image-section") ?? null;
  if (!section) return null;
  const targetSurface = dragSurfaces.get(section);
  if (!targetSurface) return null;

  const placeholder = hit?.closest<HTMLElement>(".al-image-drop-placeholder") ?? null;
  if (placeholder && dropPreview?.placeholder === placeholder) return dropPreview.target;

  const item = hit?.closest<HTMLElement>(".al-image-item[data-image-path]") ?? null;
  if (item && section.contains(item)) {
    const path = item.dataset.imagePath ?? "";
    if (!path) return null;
    return {
      surface: targetSurface,
      item,
      path,
      placement: "before",
    };
  }

  const galleryTarget = hit?.closest(
    ".al-image-gallery-viewport, .al-image-masonry, .al-image-masonry-column, .al-image-empty",
  );
  return galleryTarget && section.contains(galleryTarget)
    ? { surface: targetSurface, item: null, path: null, placement: "append" }
    : null;
}

function markDropTarget(target: ImageSectionDropTarget): void {
  if (!activeDrag || sameDropTarget(dropPreview?.target ?? null, target)) return;
  clearDropPreview();
  if (target.surface !== activeDrag.source) target.surface.setDragging(true);
  target.surface.containerEl.addClass("is-image-drag-target");

  const placeholder = createDropPlaceholder(activeDrag.item);
  let highlightedItem: HTMLElement | null = null;

  if (target.item) {
    highlightedItem = target.item;
    target.item.addClass("is-selected");
    if (target.placement === "before") target.item.before(placeholder);
    else target.item.after(placeholder);
  } else {
    const column = shortestColumn(target.surface.containerEl);
    if (column) column.appendChild(placeholder);
    else {
      const empty = target.surface.containerEl.querySelector<HTMLElement>(".al-image-empty");
      if (empty) empty.after(placeholder);
      else target.surface.containerEl.appendChild(placeholder);
    }
  }

  dropPreview = { target, placeholder, highlightedItem };
}

function updateDropTarget(surface: ImageSectionDragSurface, point: PointerDragPoint): void {
  if (!activeDrag || activeDrag.source !== surface) return;
  const target = dropTargetFor(surface, point);
  if (sameDropTarget(activeDrag.target, target)) return;
  activeDrag.target = target;
  if (!target) {
    clearDropPreview();
    return;
  }
  markDropTarget(target);
}

function cancelSurfaceDrag(surface: ImageSectionDragSurface): void {
  const sourceWasActive = activeDrag?.source === surface;
  if (sourceWasActive) {
    clearDropPreview();
    activeDrag = null;
    surface.setDragging(false);
  } else if (dropPreview?.target.surface === surface) {
    clearDropPreview();
  }
  surface.containerEl.removeClass("is-image-drag-source");
}

export function registerImageSectionDragSurface(surface: ImageSectionDragSurface): void {
  dragSurfaces.set(surface.containerEl, surface);
  surface.signal.addEventListener("abort", () => {
    if (dragSurfaces.get(surface.containerEl) === surface) dragSurfaces.delete(surface.containerEl);
    cancelSurfaceDrag(surface);
  }, { once: true });
}

export function beginImageSectionPointerDrag(
  surface: ImageSectionDragSurface,
  item: HTMLElement,
  path: string,
  event: PointerEvent,
): void {
  if (!surface.canStart(item, event)) return;
  activeDrag = { source: surface, item, path, target: null };
  armPointerDrag({
    event,
    captureElement: item,
    dragElement: item,
    signal: surface.signal,
    onFinish: () => {
      if (activeDrag?.source === surface) cancelSurfaceDrag(surface);
    },
    onStart: () => {
      surface.setDragging(true);
      surface.containerEl.addClass("is-image-drag-source");
      surface.closeMenus();
    },
    onMove: (point) => updateDropTarget(surface, point),
    onDrop: () => {
      const drag = activeDrag?.source === surface ? activeDrag : null;
      if (!drag) return;
      surface.containerEl.removeClass("is-image-drag-source");
      clearDropPreview();
      surface.setDragging(false);
      activeDrag = null;
      if (!drag.target) return;
      drag.target.surface.drop(
        drag.source.participant,
        drag.path,
        drag.target.path,
        drag.target.placement,
      );
    },
    onCancel: () => cancelSurfaceDrag(surface),
  });
}
