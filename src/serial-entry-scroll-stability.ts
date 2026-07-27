import type AnimeListPlugin from "./main";

export interface ScrollPositionSnapshot {
  restore(): void;
}

interface ElementScrollPosition {
  element: HTMLElement;
  left: number;
  top: number;
}

function isElement(value: unknown): value is Element {
  return typeof value === "object"
    && value !== null
    && "closest" in value
    && typeof Reflect.get(value, "closest") === "function";
}

/**
 * Capture every scroll container that can be affected when an editor rebuilds
 * its rows. The returned restore operation is intentionally idempotent because
 * Obsidian and the legacy fallback may finish their DOM work in different
 * microtask or animation-frame phases.
 */
export function captureScrollPosition(anchor: HTMLElement): ScrollPositionSnapshot {
  const elements: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  let current: HTMLElement | null = anchor;
  while (current) {
    if (!seen.has(current)) {
      seen.add(current);
      elements.push(current);
    }
    current = current.parentElement;
  }

  const scrollingElement = anchor.ownerDocument.scrollingElement as HTMLElement | null;
  if (scrollingElement && !seen.has(scrollingElement)) {
    elements.push(scrollingElement);
  }

  const positions: ElementScrollPosition[] = elements.map((element) => ({
    element,
    left: element.scrollLeft,
    top: element.scrollTop,
  }));
  const view = anchor.ownerDocument.defaultView;
  const windowLeft = view?.scrollX ?? 0;
  const windowTop = view?.scrollY ?? 0;

  return {
    restore(): void {
      for (const position of positions) {
        position.element.scrollLeft = position.left;
        position.element.scrollTop = position.top;
      }
      view?.scrollTo(windowLeft, windowTop);
    },
  };
}

export function findNewestSerialLabelInput(editor: HTMLElement): HTMLInputElement | null {
  const rows = editor.querySelectorAll<HTMLElement>(".al-volume-row");
  const newest = rows.item(rows.length - 1);
  return newest?.querySelector<HTMLInputElement>(
    ".al-volume-row-fields > .al-form-field:first-child > input",
  ) ?? null;
}

function scheduleStableFocus(editor: HTMLElement, snapshot: ScrollPositionSnapshot): void {
  let focused = false;
  const stabilize = (): void => {
    if (!editor.isConnected) return;
    snapshot.restore();
    if (!focused) {
      const input = findNewestSerialLabelInput(editor);
      input?.focus({ preventScroll: true });
      input?.select();
      focused = input !== null;
    }
    snapshot.restore();
  };

  queueMicrotask(stabilize);
  const view = editor.ownerDocument.defaultView;
  view?.setTimeout(stabilize, 0);
  if (view?.requestAnimationFrame) {
    view.requestAnimationFrame(() => view.requestAnimationFrame(stabilize));
  }
}

/**
 * Stabilize both the current progress-unit editor and the legacy novel editor.
 * The capture listener runs before their existing click handlers rebuild rows
 * or request smooth scrolling; restoration happens before paint and again after
 * the legacy double-requestAnimationFrame reveal path.
 */
export function installSerialEntryScrollStability(plugin: AnimeListPlugin): void {
  const handleAddClick = (event: MouseEvent): void => {
    if (!isElement(event.target)) return;
    const button = event.target.closest<HTMLButtonElement>(
      ".al-progress-unit-editor > .al-secondary-button, "
      + ".al-volume-editor-header > .al-secondary-button",
    );
    const editor = button?.closest<HTMLElement>(".al-volume-editor");
    if (!button || !editor) return;
    scheduleStableFocus(editor, captureScrollPosition(editor));
  };

  document.addEventListener("click", handleAddClick, true);
  plugin.register(() => document.removeEventListener("click", handleAddClick, true));
}
