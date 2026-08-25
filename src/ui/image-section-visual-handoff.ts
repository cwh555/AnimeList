export interface ImageSectionVisualHandoff {
  readonly element: HTMLElement;
  release(): void;
}

const OVERLAY_Z_INDEX = "1000";
export const IMAGE_SECTION_VISUAL_READY_DEADLINE_MS = 700;

function copyScrollState(source: HTMLElement, clone: HTMLElement): void {
  const sources = [source, ...source.querySelectorAll<HTMLElement>("*")];
  const clones = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  const count = Math.min(sources.length, clones.length);
  for (let index = 0; index < count; index += 1) {
    clones[index].scrollTop = sources[index].scrollTop;
    clones[index].scrollLeft = sources[index].scrollLeft;
  }
}

function sanitizeVisualClone(clone: HTMLElement): void {
  clone.removeAttribute("id");
  clone.removeAttribute("tabindex");
  clone.style.removeProperty("view-transition-name");
  clone.setAttribute("aria-hidden", "true");
  clone.dataset.imageContinuityOverlay = "true";
  clone.inert = true;
  for (const element of clone.querySelectorAll<HTMLElement>("*")) {
    element.removeAttribute("id");
    element.removeAttribute("tabindex");
    element.style.removeProperty("view-transition-name");
  }
}

export function captureImageSectionVisualHandoff(
  container: HTMLElement,
): ImageSectionVisualHandoff | null {
  const document = container.ownerDocument;
  const view = document.defaultView;
  const parent = container.parentElement;
  if (!view || !parent || !container.isConnected) return null;

  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const anchor = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  anchor.className = "al-image-continuity-anchor";
  anchor.setAttribute("aria-hidden", "true");
  Object.assign(anchor.style, {
    display: "block",
    width: "0",
    height: "0",
    margin: "0",
    padding: "0",
    pointerEvents: "none",
  });
  parent.insertBefore(anchor, container);
  const anchorRect = anchor.getBoundingClientRect();
  const offsetLeft = rect.left - anchorRect.left;
  const offsetTop = rect.top - anchorRect.top;

  const clone = container.cloneNode(true) as HTMLElement;
  sanitizeVisualClone(clone);
  Object.assign(clone.style, {
    position: "fixed",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    pointerEvents: "none",
    userSelect: "none",
    zIndex: OVERLAY_Z_INDEX,
    boxSizing: "border-box",
  });
  copyScrollState(container, clone);
  // Keep the clone at the source element's original sibling position so
  // ancestor/direct-child/positional selectors keep the same styling context.
  parent.insertBefore(clone, anchor);

  let frame = 0;
  let released = false;
  const syncPosition = (): void => {
    if (released) return;
    if (anchor.isConnected) {
      const current = anchor.getBoundingClientRect();
      clone.style.left = `${current.left + offsetLeft}px`;
      clone.style.top = `${current.top + offsetTop}px`;
    }
    frame = view.requestAnimationFrame(syncPosition);
  };
  syncPosition();

  return {
    element: clone,
    release: () => {
      if (released) return;
      released = true;
      if (frame) view.cancelAnimationFrame(frame);
      clone.remove();
      anchor.remove();
    },
  };
}

function waitForImageSettlement(image: HTMLImageElement): Promise<void> {
  if (image.complete) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = (): void => {
      image.removeEventListener("load", finish);
      image.removeEventListener("error", finish);
      resolve();
    };
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
  });
}

function delay(view: Window, milliseconds: number): Promise<void> {
  return new Promise((resolve) => view.setTimeout(resolve, milliseconds));
}

function nextFrame(view: Window): Promise<void> {
  return new Promise((resolve) => view.requestAnimationFrame(() => resolve()));
}

export async function waitForImageSectionVisualReady(
  container: HTMLElement,
  deadlineMs = IMAGE_SECTION_VISUAL_READY_DEADLINE_MS,
): Promise<void> {
  const view = container.ownerDocument.defaultView;
  if (!view || !container.isConnected) return;

  const pending = [...container.querySelectorAll<HTMLImageElement>("img")]
    .filter((image) => !image.complete)
    .map(waitForImageSettlement);
  if (pending.length > 0) {
    await Promise.race([
      Promise.all(pending).then(() => undefined),
      delay(view, deadlineMs),
    ]);
  }
  if (container.isConnected) await nextFrame(view);
}
