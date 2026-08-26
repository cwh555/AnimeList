export interface ImageSectionVisualHandoff {
  readonly element: HTMLElement;
  follow(container: HTMLElement): void;
  release(): void;
}

export const IMAGE_SECTION_VISUAL_READY_DEADLINE_MS = 700;

interface ContextPlacement {
  mount: HTMLElement;
  cleanup: HTMLElement[];
}

function shallowContextPlacement(
  ancestors: readonly HTMLElement[],
): ContextPlacement | null {
  const connectedIndex = ancestors.findIndex((ancestor) => ancestor.isConnected);
  if (connectedIndex < 0) return null;

  const mount = ancestors[connectedIndex];
  const cleanup: HTMLElement[] = [];
  let parent = mount;
  for (let index = connectedIndex - 1; index >= 0; index -= 1) {
    const clone = ancestors[index].cloneNode(false) as HTMLElement;
    clone.removeAttribute("id");
    clone.removeAttribute("tabindex");
    clone.setAttribute("aria-hidden", "true");
    clone.inert = true;
    Object.assign(clone.style, { pointerEvents: "none" });
    parent.appendChild(clone);
    cleanup.push(clone);
    parent = clone;
  }
  return { mount: parent, cleanup };
}

function visualShell(container: HTMLElement): HTMLElement {
  const shell = container.cloneNode(false) as HTMLElement;
  shell.removeAttribute("id");
  shell.removeAttribute("tabindex");
  shell.setAttribute("aria-hidden", "true");
  shell.dataset.imageContinuityOverlay = "true";
  shell.inert = true;
  Object.assign(shell.style, {
    position: "fixed",
    margin: "0",
    pointerEvents: "none",
    userSelect: "none",
    zIndex: "1000",
    boxSizing: "border-box",
  });
  return shell;
}

function setRect(element: HTMLElement, rect: DOMRectReadOnly): void {
  Object.assign(element.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

/**
 * Preserves the already-rendered descendants of an Image Section while the
 * Markdown host is replaced. Descendants are moved, never deep-cloned, so
 * decoded images/canvas state stay attached to the same browser nodes.
 */
export function preserveImageSectionVisual(
  container: HTMLElement,
  ancestors: readonly HTMLElement[],
  rect: DOMRectReadOnly,
): ImageSectionVisualHandoff | null {
  const view = container.ownerDocument.defaultView;
  const placement = shallowContextPlacement(ancestors);
  if (!view || !placement || rect.width <= 0 || rect.height <= 0) return null;

  const shell = visualShell(container);
  setRect(shell, rect);
  const children = [...container.childNodes];
  shell.replaceChildren(...children);
  placement.mount.appendChild(shell);

  let released = false;
  let followTarget: HTMLElement | null = null;
  let frame = 0;
  const sync = (): void => {
    if (released) return;
    if (followTarget?.isConnected) setRect(shell, followTarget.getBoundingClientRect());
    frame = view.requestAnimationFrame(sync);
  };
  frame = view.requestAnimationFrame(sync);

  return {
    element: shell,
    follow(target) {
      followTarget = target;
      if (target.isConnected) setRect(shell, target.getBoundingClientRect());
    },
    release() {
      if (released) return;
      released = true;
      view.cancelAnimationFrame(frame);
      shell.remove();
      for (const wrapper of placement.cleanup.reverse()) wrapper.remove();
    },
  };
}

function intersectsViewport(image: HTMLImageElement): boolean {
  const view = image.ownerDocument.defaultView;
  if (!view || !image.isConnected) return false;
  const imageRect = image.getBoundingClientRect();
  const rect = imageRect.width > 0 && imageRect.height > 0
    ? imageRect
    : image.parentElement?.getBoundingClientRect();
  if (!rect) return false;
  return rect.width > 0
    && rect.height > 0
    && rect.bottom > 0
    && rect.right > 0
    && rect.top < view.innerHeight
    && rect.left < view.innerWidth;
}

async function decodeImage(image: HTMLImageElement): Promise<void> {
  const waitForLoad = async (): Promise<void> => {
    if (image.complete) return;
    await new Promise<void>((resolve) => {
      const finish = (): void => {
        image.removeEventListener("load", finish);
        image.removeEventListener("error", finish);
        resolve();
      };
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
    });
  };

  if (typeof image.decode === "function") {
    try {
      await image.decode();
      return;
    } catch {
      // Lazy/dynamic images can reject decode() before their load is started.
      // In that case, wait for load/error and attempt decode once more.
    }
  }
  await waitForLoad();
  if (image.naturalWidth <= 0 || typeof image.decode !== "function") return;
  try {
    await image.decode();
  } catch {
    // The explicit load/error settlement above is the fallback readiness signal.
  }
}

function delay(view: Window, milliseconds: number): Promise<void> {
  return new Promise((resolve) => view.setTimeout(resolve, milliseconds));
}

function nextFrame(view: Window): Promise<void> {
  return new Promise((resolve) => view.requestAnimationFrame(() => resolve()));
}

/** Waits for currently visible successor images to decode, then crosses a paint boundary. */
export async function waitForImageSectionVisualReady(
  container: HTMLElement,
  deadlineMs = IMAGE_SECTION_VISUAL_READY_DEADLINE_MS,
): Promise<void> {
  const view = container.ownerDocument.defaultView;
  if (!view || !container.isConnected) return;

  const visibleImages = [...container.querySelectorAll<HTMLImageElement>("img")]
    .filter(intersectsViewport);
  if (visibleImages.length > 0) {
    await Promise.race([
      Promise.all(visibleImages.map(decodeImage)).then(() => undefined),
      delay(view, deadlineMs),
    ]);
  }
  if (!container.isConnected) return;
  await nextFrame(view);
  if (container.isConnected) await nextFrame(view);
}
