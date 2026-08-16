export interface ScrollPositionSnapshot {
  restore(): void;
}

interface ElementScrollPosition {
  element: HTMLElement;
  left: number;
  top: number;
}

/**
 * Capture every scroll container that can be affected when an editor rebuilds
 * its rows. The returned restore operation is intentionally idempotent because Obsidian may finish modal layout in different microtask or animation-frame phases.
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
    '.al-volume-row-fields > .al-form-field[data-serial-field="label"] > input',
  ) ?? null;
}

export function scheduleStableSerialEntryFocus(
  editor: HTMLElement,
  snapshot: ScrollPositionSnapshot,
): void {
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
