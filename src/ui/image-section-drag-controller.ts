import type { ImageSectionDropPlacement } from "../domain/image-section-order";
import { armPointerDrag, type PointerDragPoint } from "./pointer-drag";
import {
  clearImageSectionAssetMovePreview,
  previewImageSectionAssetMove,
  type ImageSectionMoveParticipant,
} from "./image-section-move-coordinator";

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

function clearDropPreview(restoreLayout = true): void {
  if (!dropPreview) return;
  const { target, highlightedItem } = dropPreview;
  if (restoreLayout && activeDrag) {
    clearImageSectionAssetMovePreview(activeDrag.source.participant, target.surface.participant);
  }
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

  const item = hit?.closest<HTMLElement>(".al-image-item[data-image-path]") ?? null;
  if (item && section.contains(item)) {
    if (item === activeDrag?.item) return dropPreview?.target ?? null;
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
  const canTransitionPreviewInPlace = dropPreview?.target.surface.participant === target.surface.participant
    && activeDrag.source.participant === target.surface.participant;
  clearDropPreview(!canTransitionPreviewInPlace);
  if (target.surface !== activeDrag.source) target.surface.setDragging(true);
  target.surface.containerEl.addClass("is-image-drag-target");

  const highlightedItem = target.item;
  highlightedItem?.addClass("is-selected");
  previewImageSectionAssetMove({
    source: activeDrag.source.participant,
    target: target.surface.participant,
    path: activeDrag.path,
    targetPath: target.path,
    placement: target.placement,
  });
  dropPreview = { target, highlightedItem };
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
      clearDropPreview(false);
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
