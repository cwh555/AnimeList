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
