export interface ImageFallbackOptions {
  onError?: () => void;
}

/**
 * Replace a static image with a surface-owned fallback if the browser cannot
 * decode/load its source. Call this before assigning `src` so cached failures
 * cannot escape the handler.
 */
export function bindImageFallback(
  image: HTMLImageElement,
  createFallback: () => Node | null,
  options: ImageFallbackOptions = {},
): void {
  image.addEventListener("error", () => {
    options.onError?.();
    const fallback = createFallback();
    if (fallback) image.replaceWith(fallback);
    else image.remove();
  }, { once: true });
}
