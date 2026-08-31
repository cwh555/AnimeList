import type { ImageSectionDropPlacement } from "../domain/image-section-order";
import { armPointerDrag, type PointerDragPoint } from "./pointer-drag";
import {
  resolveImageSectionDragHit,
  type ImageSectionDragHitGeometry,
  type ImageSectionDragHitRegion,
} from "./image-section-drag-hit-testing";
import {
  beginImageSectionPointerFollow,
  endImageSectionPointerFollow,
  moveImageSectionPointerFollow,
  type ImageSectionPointerFollow,
} from "./image-section-drag-follow";
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

interface ImageSectionDragItemRegion extends ImageSectionDragHitRegion<string> {
  item: HTMLElement;
}

interface ImageSectionDragGeometry extends ImageSectionDragHitGeometry<string> {
  viewport: HTMLElement | null;
  viewportScrollTop: number;
  regions: ImageSectionDragItemRegion[];
}

interface ActiveImageDrag {
  source: ImageSectionDragSurface;
  item: HTMLElement;
  path: string;
  target: ImageSectionDropTarget | null;
  geometry: ImageSectionDragGeometry | null;
  follow: ImageSectionPointerFollow | null;
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

function captureDragGeometry(surface: ImageSectionDragSurface, sourceItem: HTMLElement): ImageSectionDragGeometry {
  const sectionRect = surface.containerEl.getBoundingClientRect();
  const viewport = surface.containerEl.querySelector<HTMLElement>(".al-image-gallery-viewport");
  const sourcePath = sourceItem.dataset.imagePath ?? "";
  const terminalRegionValue = [...surface.participant.paths()]
    .filter((path) => path !== sourcePath)
    .at(-1) ?? null;
  const regions = [...surface.containerEl.querySelectorAll<HTMLElement>(".al-image-item[data-image-path]")]
    .filter((item) => item !== sourceItem)
    .map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        item,
        value: item.dataset.imagePath ?? "",
        left: rect.left - sectionRect.left,
        top: rect.top - sectionRect.top,
        right: rect.right - sectionRect.left,
        bottom: rect.bottom - sectionRect.top,
      };
    })
    .filter((region) => Boolean(region.value));
  return {
    width: sectionRect.width,
    height: sectionRect.height,
    viewport,
    viewportScrollTop: viewport?.scrollTop ?? 0,
    maxBottom: regions.reduce((maximum, region) => Math.max(maximum, region.bottom), 0),
    terminalRegionValue,
    regions,
  };
}

function sameSectionSnapshotTarget(
  drag: ActiveImageDrag,
  point: PointerDragPoint,
): ImageSectionDropTarget | null | undefined {
  const geometry = drag.geometry;
  if (!geometry) return undefined;
  const sectionRect = drag.source.containerEl.getBoundingClientRect();
  const scrollDelta = (geometry.viewport?.scrollTop ?? geometry.viewportScrollTop) - geometry.viewportScrollTop;
  const localX = point.clientX - sectionRect.left;
  const localY = point.clientY - sectionRect.top + scrollDelta;
  const sourceTarget = drag.target?.surface === drag.source ? drag.target : null;
  const currentPath = sourceTarget?.path ?? null;
  const decision = resolveImageSectionDragHit({
    geometry,
    x: localX,
    y: localY,
    currentRegionValue: currentPath,
    currentIsAppend: sourceTarget?.placement === "append",
  });

  if (decision.kind === "hold") return sourceTarget;
  if (decision.kind === "outside") return undefined;
  if (decision.kind === "append") {
    return { surface: drag.source, item: null, path: null, placement: "append" };
  }
  const region = geometry.regions.find((candidate) => candidate.value === decision.region.value);
  return region
    ? { surface: drag.source, item: region.item, path: region.value, placement: "before" }
    : sourceTarget;
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

function dragHitElement(document: Document, point: PointerDragPoint): HTMLElement | null {
  const sourceItem = activeDrag?.item ?? null;
  const hits = typeof document.elementsFromPoint === "function"
    ? document.elementsFromPoint(point.clientX, point.clientY)
    : [document.elementFromPoint(point.clientX, point.clientY)].filter((element): element is Element => Boolean(element));
  for (const candidate of hits) {
    if (sourceItem?.contains(candidate)) continue;
    return candidate as HTMLElement;
  }
  return null;
}

function dropTargetFor(surface: ImageSectionDragSurface, point: PointerDragPoint): ImageSectionDropTarget | null {
  const document = surface.containerEl.ownerDocument;
  const hit = dragHitElement(document, point);
  const section = hit?.closest<HTMLElement>(".animelist-image-section") ?? null;
  const targetSurface = section ? dragSurfaces.get(section) ?? null : null;

  // Prefer an explicitly hit registered destination section. Otherwise let the
  // source snapshot retain its current target through small outer-boundary
  // excursions instead of clearing/rebuilding the preview on every pixel.
  if (activeDrag && targetSurface !== activeDrag.source) {
    if (targetSurface) return liveDropTargetFor(targetSurface, section, hit);
    const snapshotTarget = sameSectionSnapshotTarget(activeDrag, point);
    if (snapshotTarget !== undefined) return snapshotTarget;
    return null;
  }
  if (activeDrag) {
    const snapshotTarget = sameSectionSnapshotTarget(activeDrag, point);
    if (snapshotTarget !== undefined) return snapshotTarget;
  }
  if (!targetSurface || !section) return null;
  return liveDropTargetFor(targetSurface, section, hit);
}

function liveDropTargetFor(
  targetSurface: ImageSectionDragSurface,
  section: HTMLElement,
  hit: HTMLElement | null,
): ImageSectionDropTarget | null {
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
    const drag = activeDrag;
    clearDropPreview();
    endImageSectionPointerFollow(drag.follow);
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
  const startPoint = { clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType };
  activeDrag = { source: surface, item, path, target: null, geometry: null, follow: null };
  armPointerDrag({
    event,
    captureElement: item,
    dragElement: item,
    signal: surface.signal,
    onFinish: () => {
      if (activeDrag?.source === surface) cancelSurfaceDrag(surface);
    },
    onStart: () => {
      if (activeDrag?.source === surface) {
        activeDrag.geometry = captureDragGeometry(surface, item);
        activeDrag.follow = beginImageSectionPointerFollow(item, startPoint);
      }
      surface.setDragging(true);
      surface.containerEl.addClass("is-image-drag-source");
      surface.closeMenus();
    },
    onMove: (point) => {
      updateDropTarget(surface, point);
      if (activeDrag?.source === surface) moveImageSectionPointerFollow(activeDrag.follow, point);
    },
    onDrop: () => {
      const drag = activeDrag?.source === surface ? activeDrag : null;
      if (!drag) return;
      surface.containerEl.removeClass("is-image-drag-source");
      clearDropPreview(false);
      surface.setDragging(false);
      activeDrag = null;
      if (drag.target) {
        drag.target.surface.drop(
          drag.source.participant,
          drag.path,
          drag.target.path,
          drag.target.placement,
        );
      }
      endImageSectionPointerFollow(drag.follow);
    },
    onCancel: () => cancelSurfaceDrag(surface),
  });
}
