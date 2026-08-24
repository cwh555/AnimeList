import type { ImageSectionDropPlacement } from "../domain/image-section-order";
import { armPointerDrag, type PointerDragPoint } from "./pointer-drag";
import type { ImageSectionMoveParticipant } from "./image-section-move-coordinator";

export interface ImageSectionDragSurface {
  containerEl: HTMLElement;
  participant: ImageSectionMoveParticipant;
  signal: AbortSignal;
  canStart(item: HTMLElement, event: PointerEvent): boolean;
  closeMenus(): void;
  drop(
    source: ImageSectionMoveParticipant,
    path: string,
    targetPath: string | null,
    placement: ImageSectionDropPlacement,
  ): void;
}

interface ImageSectionDropTarget {
  surface: ImageSectionDragSurface;
  path: string | null;
  placement: ImageSectionDropPlacement;
}

interface ActiveImageDrag {
  source: ImageSectionDragSurface;
  path: string;
  target: ImageSectionDropTarget | null;
}

const dragSurfaces = new WeakMap<HTMLElement, ImageSectionDragSurface>();
let activeDrag: ActiveImageDrag | null = null;

function clearDropIndicators(document: Document): void {
  for (const item of document.querySelectorAll<HTMLElement>(
    ".al-image-item.is-drop-before, .al-image-item.is-drop-after",
  )) {
    item.removeClass("is-drop-before", "is-drop-after");
  }
  for (const section of document.querySelectorAll<HTMLElement>(".animelist-image-section.is-image-drag-target")) {
    section.removeClass("is-image-drag-target");
  }
}

function placementFor(item: HTMLElement, clientY: number): ImageSectionDropPlacement {
  const rect = item.getBoundingClientRect();
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
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
    const path = item.dataset.imagePath ?? "";
    if (!path) return null;
    return {
      surface: targetSurface,
      path,
      placement: placementFor(item, point.clientY),
    };
  }

  const galleryTarget = hit?.closest(
    ".al-image-gallery-viewport, .al-image-masonry, .al-image-masonry-column, .al-image-empty",
  );
  return galleryTarget && section.contains(galleryTarget)
    ? { surface: targetSurface, path: null, placement: "append" }
    : null;
}

function markDropTarget(target: ImageSectionDropTarget): void {
  const document = target.surface.containerEl.ownerDocument;
  clearDropIndicators(document);
  target.surface.containerEl.addClass("is-image-drag-target");
  if (!target.path) return;
  const item = target.surface.containerEl.querySelector<HTMLElement>(
    `.al-image-item[data-image-path="${CSS.escape(target.path)}"]`,
  );
  if (!item) return;
  item.addClass(target.placement === "before" ? "is-drop-before" : "is-drop-after");
}

function updateDropTarget(surface: ImageSectionDragSurface, point: PointerDragPoint): void {
  if (!activeDrag || activeDrag.source !== surface) return;
  const target = dropTargetFor(surface, point);
  activeDrag.target = target;
  if (!target) {
    clearDropIndicators(surface.containerEl.ownerDocument);
    return;
  }
  markDropTarget(target);
}

function cancelActiveDrag(surface: ImageSectionDragSurface): void {
  if (activeDrag?.source === surface) activeDrag = null;
  surface.containerEl.removeClass("is-image-drag-source");
  clearDropIndicators(surface.containerEl.ownerDocument);
}

export function registerImageSectionDragSurface(surface: ImageSectionDragSurface): void {
  dragSurfaces.set(surface.containerEl, surface);
  surface.signal.addEventListener("abort", () => {
    if (dragSurfaces.get(surface.containerEl) === surface) dragSurfaces.delete(surface.containerEl);
    cancelActiveDrag(surface);
  }, { once: true });
}

export function beginImageSectionPointerDrag(
  surface: ImageSectionDragSurface,
  item: HTMLElement,
  path: string,
  event: PointerEvent,
): void {
  if (!surface.canStart(item, event)) return;
  activeDrag = { source: surface, path, target: null };
  armPointerDrag({
    event,
    captureElement: item,
    dragElement: item,
    signal: surface.signal,
    onStart: () => {
      surface.containerEl.addClass("is-image-drag-source");
      surface.closeMenus();
    },
    onMove: (point) => updateDropTarget(surface, point),
    onDrop: () => {
      const drag = activeDrag?.source === surface ? activeDrag : null;
      activeDrag = null;
      surface.containerEl.removeClass("is-image-drag-source");
      clearDropIndicators(surface.containerEl.ownerDocument);
      if (!drag?.target) return;
      drag.target.surface.drop(
        drag.source.participant,
        drag.path,
        drag.target.path,
        drag.target.placement,
      );
    },
    onCancel: () => cancelActiveDrag(surface),
  });
}
