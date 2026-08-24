import type { ImageSectionDropPlacement } from "../domain/image-section-order";
import { armPointerDrag, type PointerDragPoint } from "./pointer-drag";
import {
  adoptImageSectionMoveParticipant,
  beginImageSectionMoveInteraction,
  endImageSectionMoveInteraction,
  scheduleImageSectionMoveParticipantAdoption,
} from "./image-section-move-lifecycle";
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
  item: HTMLElement | null;
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
let markedTarget: ImageSectionDropTarget | null = null;

function sameDropTarget(left: ImageSectionDropTarget | null, right: ImageSectionDropTarget | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.surface === right.surface
    && left.item === right.item
    && left.path === right.path
    && left.placement === right.placement;
}

function clearDropIndicator(): void {
  if (!markedTarget) return;
  markedTarget.item?.removeClass("is-drop-before", "is-drop-after");
  markedTarget.surface.containerEl.removeClass("is-image-drag-target");
  markedTarget = null;
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
      item,
      path,
      placement: placementFor(item, point.clientY),
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
  if (sameDropTarget(markedTarget, target)) return;
  clearDropIndicator();
  target.surface.containerEl.addClass("is-image-drag-target");
  target.item?.addClass(target.placement === "before" ? "is-drop-before" : "is-drop-after");
  markedTarget = target;
}

function updateDropTarget(surface: ImageSectionDragSurface, point: PointerDragPoint): void {
  if (!activeDrag || activeDrag.source !== surface) return;
  const target = dropTargetFor(surface, point);
  if (sameDropTarget(activeDrag.target, target)) return;
  activeDrag.target = target;
  if (!target) {
    clearDropIndicator();
    return;
  }
  markDropTarget(target);
}

function cancelSurfaceDrag(surface: ImageSectionDragSurface): void {
  const sourceWasActive = activeDrag?.source === surface;
  if (sourceWasActive) activeDrag = null;
  surface.containerEl.removeClass("is-image-drag-source");
  if (sourceWasActive || markedTarget?.surface === surface) clearDropIndicator();
}

export function registerImageSectionDragSurface(surface: ImageSectionDragSurface): void {
  dragSurfaces.set(surface.containerEl, surface);
  scheduleImageSectionMoveParticipantAdoption(surface.participant, surface.signal);
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
  adoptImageSectionMoveParticipant(surface.participant);
  activeDrag = { source: surface, path, target: null };
  armPointerDrag({
    event,
    captureElement: item,
    dragElement: item,
    signal: surface.signal,
    onArm: () => beginImageSectionMoveInteraction(surface.participant),
    onFinish: () => {
      endImageSectionMoveInteraction(surface.participant);
      if (activeDrag?.source === surface) cancelSurfaceDrag(surface);
    },
    onStart: () => {
      surface.containerEl.addClass("is-image-drag-source");
      surface.closeMenus();
    },
    onMove: (point) => updateDropTarget(surface, point),
    onDrop: () => {
      const drag = activeDrag?.source === surface ? activeDrag : null;
      activeDrag = null;
      surface.containerEl.removeClass("is-image-drag-source");
      clearDropIndicator();
      if (!drag?.target) return;
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
