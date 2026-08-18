import { momentStackOffsetsY, normalizeMomentStackGapsY } from "../domain/moment-image-layout";
import { makeEl } from "./ui-helpers";

export interface MomentStackVisualItem {
  src?: string;
  srcset?: string;
  sizes?: string;
  missingLabel: string;
}

export interface MomentStackVisualOptions {
  items: readonly MomentStackVisualItem[];
  gapsY: readonly number[];
  className?: string;
  activate?: (index: number, event: MouseEvent) => void;
  contextMenu?: (index: number, event: MouseEvent) => void;
}

export interface MomentStackVisual {
  element: HTMLElement;
  setGapsY(gapsY: readonly number[]): void;
  layer(index: number): HTMLElement | null;
}

function frame(
  item: MomentStackVisualItem,
  index: number,
  count: number,
  options: MomentStackVisualOptions,
): HTMLElement {
  const interactive = Boolean(options.activate || options.contextMenu);
  const top = index === 0;
  const element = makeEl(
    interactive ? "button" : "div",
    `al-moment-stack-layer ${top ? "al-moment-stack-top" : "al-moment-stack-strip"}`,
  );
  if (element instanceof HTMLButtonElement) element.type = "button";
  if (top) element.addClass("is-top");
  element.dataset.stackIndex = String(index);
  element.style.zIndex = String(count - index);
  element.setCssStyles({
    height: "auto",
    minHeight: "0",
    ...(!top ? { position: "absolute", left: "0" } : {}),
  });

  if (item.src) {
    const image = makeEl(
      "img",
      `al-moment-stack-image ${top ? "al-moment-stack-top-image" : "al-moment-stack-strip-image"}`,
    );
    image.src = item.src;
    if (item.srcset) image.srcset = item.srcset;
    if (item.sizes) image.sizes = item.sizes;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.draggable = false;
    // The image itself remains whole. These inline geometry rules intentionally
    // override Obsidian/button theme sizing and the V1 crop-window CSS hooks.
    image.setCssStyles({
      width: "100%",
      maxWidth: "100%",
      height: "auto",
      maxHeight: "none",
      objectFit: "contain",
      objectPosition: "50% 50%",
    });
    element.appendChild(image);
  } else {
    element.appendChild(makeEl("div", "al-moment-stack-missing", item.missingLabel));
  }

  if (options.activate) {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      options.activate?.(index, event as MouseEvent);
    });
  }
  if (options.contextMenu) {
    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.contextMenu?.(index, event as MouseEvent);
    });
  }
  return element;
}

function applyStackGeometry(element: HTMLElement, gapsY: readonly number[], imageCount: number): void {
  const normalized = normalizeMomentStackGapsY(gapsY, imageCount);
  const offsets = momentStackOffsetsY(normalized, imageCount);
  const depth = offsets.at(-1) ?? 0;
  offsets.forEach((offset, index) => {
    const layer = element.querySelector<HTMLElement>(`[data-stack-index="${index}"]`);
    if (!layer) return;
    if (index === 0) {
      layer.setCssStyles({ marginBottom: `${depth}px` });
      return;
    }
    layer.setCssStyles({ bottom: `${depth - offset}px` });
  });
}

export function createMomentStackVisual(options: MomentStackVisualOptions): MomentStackVisual {
  const element = makeEl("div", `al-moment-stack${options.className ? ` ${options.className}` : ""}`);
  element.setCssStyles({
    display: "block",
    position: "relative",
    width: "min(100%, 760px)",
  });
  options.items.forEach((item, index) => element.appendChild(frame(item, index, options.items.length, options)));
  applyStackGeometry(element, options.gapsY, options.items.length);

  return {
    element,
    setGapsY(gapsY) {
      applyStackGeometry(element, gapsY, options.items.length);
    },
    layer(index) {
      if (index < 0 || index >= options.items.length) return null;
      return element.querySelector<HTMLElement>(`[data-stack-index="${index}"]`);
    },
  };
}
