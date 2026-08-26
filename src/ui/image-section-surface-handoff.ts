export interface ReusableImageSectionImage {
  path: string;
  image: HTMLImageElement;
  source: string;
  srcset: string;
}

export interface ImageSectionSurfaceHandoff {
  readonly element: HTMLElement;
  takeReusableImages(): ReusableImageSectionImage[];
  release(): void;
}

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

function surfaceShell(container: HTMLElement, rect: DOMRectReadOnly): HTMLElement {
  const shell = container.cloneNode(false) as HTMLElement;
  shell.removeAttribute("id");
  shell.removeAttribute("tabindex");
  shell.setAttribute("aria-hidden", "true");
  shell.dataset.imageContinuitySurface = "true";
  shell.inert = true;
  Object.assign(shell.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    pointerEvents: "none",
    userSelect: "none",
    zIndex: "1000",
    boxSizing: "border-box",
  });
  return shell;
}

function reusableImagesFrom(surface: HTMLElement): ReusableImageSectionImage[] {
  const reusable: ReusableImageSectionImage[] = [];
  for (const item of surface.querySelectorAll<HTMLElement>(".al-image-item[data-image-path]")) {
    const path = item.dataset.imagePath;
    const image = item.querySelector<HTMLImageElement>("img");
    if (!path || !image) continue;
    reusable.push({
      path,
      image,
      source: image.getAttribute("src") ?? "",
      srcset: image.getAttribute("srcset") ?? "",
    });
  }
  return reusable;
}

/**
 * Parks one already-painted Image Section while Obsidian replaces its Markdown
 * host. The parked surface is only a pre-successor bridge. Once the successor
 * claims it, reusable image nodes are moved out and the parked surface is
 * removed synchronously; old and new complete surfaces must never paint at the
 * same time.
 */
export function parkImageSectionSurface(
  container: HTMLElement,
  ancestors: readonly HTMLElement[],
  rect: DOMRectReadOnly,
): ImageSectionSurfaceHandoff | null {
  const placement = shallowContextPlacement(ancestors);
  if (!placement || rect.width <= 0 || rect.height <= 0 || container.childNodes.length === 0) return null;

  const shell = surfaceShell(container, rect);
  shell.replaceChildren(...container.childNodes);
  placement.mount.appendChild(shell);

  let released = false;
  let imagesTaken = false;
  return {
    element: shell,
    takeReusableImages() {
      if (released || imagesTaken) return [];
      imagesTaken = true;
      const reusable = reusableImagesFrom(shell);
      for (const entry of reusable) entry.image.remove();
      return reusable;
    },
    release() {
      if (released) return;
      released = true;
      shell.remove();
      for (const wrapper of [...placement.cleanup].reverse()) wrapper.remove();
    },
  };
}
