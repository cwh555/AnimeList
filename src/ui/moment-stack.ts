import { makeEl } from "./ui-helpers";

export interface MomentStackVisualItem {
  src?: string;
  srcset?: string;
  sizes?: string;
  focusY: number;
  missingLabel: string;
}

export interface MomentStackVisualOptions {
  items: readonly MomentStackVisualItem[];
  reveal: number;
  className?: string;
  activate?: (index: number, event: MouseEvent) => void;
  contextMenu?: (index: number, event: MouseEvent) => void;
}

export interface MomentStackVisual {
  element: HTMLElement;
  setFocusY(index: number, focusY: number): void;
  setReveal(reveal: number): void;
  strip(index: number): HTMLElement | null;
}

function frame(
  item: MomentStackVisualItem,
  index: number,
  options: MomentStackVisualOptions,
): HTMLElement {
  const interactive = Boolean(options.activate || options.contextMenu);
  const element = makeEl(interactive ? "button" : "div", index === 0 ? "al-moment-stack-top" : "al-moment-stack-strip");
  if (element instanceof HTMLButtonElement) element.type = "button";
  element.dataset.stackIndex = String(index);
  if (index > 0) element.style.setProperty("--al-moment-stack-focus-y", `${item.focusY}%`);

  if (item.src) {
    const image = makeEl("img", index === 0 ? "al-moment-stack-top-image" : "al-moment-stack-strip-image");
    image.src = item.src;
    if (item.srcset) image.srcset = item.srcset;
    if (item.sizes) image.sizes = item.sizes;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.draggable = false;
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

export function createMomentStackVisual(options: MomentStackVisualOptions): MomentStackVisual {
  const element = makeEl("div", `al-moment-stack${options.className ? ` ${options.className}` : ""}`);
  element.style.setProperty("--al-moment-stack-reveal", `${options.reveal}px`);
  options.items.forEach((item, index) => element.appendChild(frame(item, index, options)));

  return {
    element,
    setFocusY(index, focusY) {
      const target = element.querySelector<HTMLElement>(`[data-stack-index="${index}"]`);
      target?.style.setProperty("--al-moment-stack-focus-y", `${focusY}%`);
    },
    setReveal(reveal) {
      element.style.setProperty("--al-moment-stack-reveal", `${reveal}px`);
    },
    strip(index) {
      if (index <= 0) return null;
      return element.querySelector<HTMLElement>(`[data-stack-index="${index}"]`);
    },
  };
}
