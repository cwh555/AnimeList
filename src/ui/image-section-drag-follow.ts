import type { PointerDragPoint } from "./pointer-drag";

export interface ImageSectionPointerFollow {
  element: HTMLElement;
  grabOffsetX: number;
  grabOffsetY: number;
  translateX: number;
  translateY: number;
  previousZIndex: string;
}

function nextDragZIndex(element: HTMLElement): string {
  const root = element.closest<HTMLElement>(".al-image-masonry");
  const view = element.ownerDocument.defaultView;
  let maximum = 0;
  for (const item of root?.querySelectorAll<HTMLElement>(".al-image-item") ?? []) {
    if (item === element) continue;
    const parsed = Number.parseInt(view?.getComputedStyle(item).zIndex ?? "", 10);
    if (Number.isFinite(parsed)) maximum = Math.max(maximum, parsed);
  }
  return String(maximum + 1);
}

export function beginImageSectionPointerFollow(
  element: HTMLElement,
  point: PointerDragPoint,
): ImageSectionPointerFollow {
  const rect = element.getBoundingClientRect();
  const previousZIndex = element.style.getPropertyValue("z-index");
  const zIndex = nextDragZIndex(element);
  element.style.setProperty("z-index", zIndex);
  return {
    element,
    grabOffsetX: point.clientX - rect.left,
    grabOffsetY: point.clientY - rect.top,
    translateX: 0,
    translateY: 0,
    previousZIndex,
  };
}

export function moveImageSectionPointerFollow(
  follow: ImageSectionPointerFollow | null,
  point: PointerDragPoint,
): void {
  if (!follow) return;
  if (follow.element.dataset.layoutMotion === "active") {
    for (const animation of follow.element.getAnimations()) animation.cancel();
    delete follow.element.dataset.layoutMotion;
  }
  const rect = follow.element.getBoundingClientRect();
  const baseLeft = rect.left - follow.translateX;
  const baseTop = rect.top - follow.translateY;
  const translateX = point.clientX - follow.grabOffsetX - baseLeft;
  const translateY = point.clientY - follow.grabOffsetY - baseTop;
  follow.translateX = translateX;
  follow.translateY = translateY;
  follow.element.style.setProperty("translate", `${translateX}px ${translateY}px`);
}

export function endImageSectionPointerFollow(follow: ImageSectionPointerFollow | null): void {
  if (!follow) return;
  follow.element.style.removeProperty("translate");
  if (follow.previousZIndex) follow.element.style.setProperty("z-index", follow.previousZIndex);
  else follow.element.style.removeProperty("z-index");
}
