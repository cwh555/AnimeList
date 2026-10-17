export const OBSIDIAN_IGNORE_SWIPE_ATTRIBUTE = "data-ignore-swipe";

/**
 * Claim one horizontal interaction surface for AnimeList on mobile.
 *
 * Obsidian mobile skips its own swipe action when the event starts inside an
 * element marked with `data-ignore-swipe`. Keep the marker local to the actual
 * horizontal control/rail instead of a page root so native Obsidian gestures
 * remain available everywhere else.
 */
export function isolateHorizontalSwipeSurface<T extends HTMLElement>(element: T): T {
  element.setAttribute(OBSIDIAN_IGNORE_SWIPE_ATTRIBUTE, "true");
  return element;
}

/**
 * Reserve screen-edge swipe start targets as siblings of a protected gesture
 * surface. A marker on their parent would make Obsidian ignore these too.
 *
 * CSS activates the targets only in Obsidian mobile, preserving desktop input.
 * The host container must be positioned to align the edge zones with the
 * protected surface.
 */
export function appendObsidianNativeSwipeEdges(container: HTMLElement): void {
  for (const side of ["left", "right"] as const) {
    // eslint-disable-next-line obsidianmd/prefer-create-el -- This helper must also run in browser fixtures without Obsidian DOM extensions.
    const edge = container.ownerDocument.createElement("div");
    edge.className = `al-native-swipe-edge is-${side}`;
    edge.setAttribute("aria-hidden", "true");
    container.appendChild(edge);
  }
}
