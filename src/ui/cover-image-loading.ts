export interface CoverImageLoadingOptions {
  selector: string;
  revealClass?: string;
  eagerCount?: number;
  rootMarginPx?: number;
}

export interface CoverImageLoadingController {
  sync(): void;
  disconnect(): void;
}

function coverImageIsReady(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0;
}

function findScrollRoot(root: HTMLElement): HTMLElement | null {
  const view = root.ownerDocument.defaultView;
  let current: HTMLElement | null = root;
  while (current) {
    const overflowY = view?.getComputedStyle(current).overflowY ?? "";
    if (overflowY === "auto" || overflowY === "scroll") return current;
    current = current.parentElement;
  }
  return null;
}

export function installCoverImageLoading(
  root: HTMLElement,
  options: CoverImageLoadingOptions,
): CoverImageLoadingController {
  if (!root.ownerDocument) {
    return { sync: () => {}, disconnect: () => {} };
  }
  const view = root.ownerDocument.defaultView;
  const Observer = view?.IntersectionObserver;
  const rootMarginPx = Number.isFinite(options.rootMarginPx)
    ? Math.max(0, Math.round(options.rootMarginPx ?? 1200))
    : 1200;
  const eagerCount = Number.isFinite(options.eagerCount)
    ? Math.max(0, Math.round(options.eagerCount ?? 0))
    : 0;
  const scrollRoot = findScrollRoot(root);
  const registered = new WeakSet<HTMLImageElement>();
  const tracked = new Set<HTMLImageElement>();
  let registeredCount = 0;

  const revealIfReady = (image: HTMLImageElement): void => {
    if (options.revealClass && coverImageIsReady(image)) image.classList.add(options.revealClass);
  };

  const promote = (image: HTMLImageElement, highPriority = false): void => {
    image.loading = "eager";
    image.fetchPriority = highPriority ? "high" : "auto";
    revealIfReady(image);
    if (typeof image.decode === "function" && !coverImageIsReady(image)) {
      void image.decode().then(() => revealIfReady(image)).catch(() => undefined);
    }
  };

  const observer = Observer
    ? new Observer((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.target.nodeName !== "IMG") continue;
        const image = entry.target as HTMLImageElement;
        observer.unobserve(image);
        promote(image);
      }
    }, {
      root: scrollRoot,
      rootMargin: `${rootMarginPx}px 0px`,
      threshold: 0,
    })
    : null;

  const register = (image: HTMLImageElement): void => {
    revealIfReady(image);
    tracked.add(image);
    if (!registered.has(image)) {
      registered.add(image);
      registeredCount += 1;
      const revealClass = options.revealClass;
      if (revealClass) image.addEventListener("load", () => image.classList.add(revealClass), { once: true });
    }
    const priority = image.loading === "eager" || registeredCount <= eagerCount;
    if (priority || coverImageIsReady(image) || !observer) {
      observer?.unobserve(image);
      promote(image, priority);
      return;
    }
    image.loading = "lazy";
    image.fetchPriority = "auto";
    observer.observe(image);
  };

  const sync = (): void => {
    for (const image of tracked) {
      if (root.contains(image)) continue;
      observer?.unobserve(image);
      tracked.delete(image);
    }
    root.querySelectorAll<HTMLImageElement>(options.selector).forEach(register);
  };

  sync();
  return {
    sync,
    disconnect(): void {
      observer?.disconnect();
      tracked.clear();
    },
  };
}
