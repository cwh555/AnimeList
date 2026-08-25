import {
  registerImageSectionMoveLifecycleHooks,
  unregisterImageSectionMoveLifecycleHooks,
} from "./image-section-move-lifecycle";

export interface ImageSectionContinuitySlot {
  container: HTMLElement;
  sourcePath: string;
  expectedPaths: readonly string[];
  lineStart?: number;
}

interface ContinuityOverlay {
  element: HTMLElement;
  anchor: HTMLElement;
  cancelFrame: () => void;
}

interface PendingSlot extends ImageSectionContinuitySlot {
  expectedKey: string;
  claimedContainer: HTMLElement | null;
  overlay: ContinuityOverlay | null;
}

interface PendingTransaction {
  document: Document;
  sourcePath: string;
  slots: PendingSlot[];
  done: Promise<void>;
  resolveDone: () => void;
  deadlineTimer: number | null;
  finishScheduled: boolean;
  finished: boolean;
}

const activeTransactions = new WeakMap<Document, Map<string, PendingTransaction>>();
const HOST_REPLACEMENT_DEADLINE_MS = 3000;
const OVERLAY_Z_INDEX = "1000";

function pathsKey(paths: readonly string[]): string {
  return JSON.stringify(paths);
}

function documentTransactions(document: Document): Map<string, PendingTransaction> {
  let transactions = activeTransactions.get(document);
  if (!transactions) {
    transactions = new Map();
    activeTransactions.set(document, transactions);
  }
  return transactions;
}

function copyScrollState(source: HTMLElement, clone: HTMLElement): void {
  const sources = [source, ...source.querySelectorAll<HTMLElement>("*")];
  const clones = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  const count = Math.min(sources.length, clones.length);
  for (let index = 0; index < count; index += 1) {
    clones[index].scrollTop = sources[index].scrollTop;
    clones[index].scrollLeft = sources[index].scrollLeft;
  }
}

function sanitizeOverlayClone(clone: HTMLElement): void {
  clone.removeAttribute("id");
  clone.style.removeProperty("view-transition-name");
  clone.setAttribute("aria-hidden", "true");
  clone.dataset.imageContinuityOverlay = "true";
  clone.inert = true;
  for (const element of clone.querySelectorAll<HTMLElement>("[id], [tabindex]")) {
    element.removeAttribute("id");
    element.removeAttribute("tabindex");
  }
}

function createContinuityOverlay(container: HTMLElement): ContinuityOverlay | null {
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
  sanitizeOverlayClone(clone);
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
  document.body.appendChild(clone);

  let frame = 0;
  let stopped = false;
  const syncPosition = (): void => {
    if (stopped) return;
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
    anchor,
    cancelFrame: () => {
      stopped = true;
      if (frame) view.cancelAnimationFrame(frame);
    },
  };
}

function removeContinuityOverlay(overlay: ContinuityOverlay | null): void {
  if (!overlay) return;
  overlay.cancelFrame();
  overlay.element.remove();
  overlay.anchor.remove();
}

function finishTransaction(transaction: PendingTransaction): void {
  if (transaction.finished) return;
  transaction.finished = true;
  const view = transaction.document.defaultView;
  if (transaction.deadlineTimer !== null) view?.clearTimeout(transaction.deadlineTimer);
  transaction.deadlineTimer = null;
  const transactions = activeTransactions.get(transaction.document);
  if (transactions?.get(transaction.sourcePath) === transaction) {
    transactions.delete(transaction.sourcePath);
    if (transactions.size === 0) activeTransactions.delete(transaction.document);
  }
  unregisterImageSectionMoveLifecycleHooks(
    transaction.document,
    transaction.sourcePath,
    transaction,
  );
  for (const slot of transaction.slots) removeContinuityOverlay(slot.overlay);
  transaction.resolveDone();
}

function createTransaction(slots: readonly ImageSectionContinuitySlot[], document: Document): PendingTransaction {
  let resolveDone = (): void => {};
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  const transaction: PendingTransaction = {
    document,
    sourcePath: slots[0].sourcePath,
    slots: slots.map((slot) => ({
      ...slot,
      expectedKey: pathsKey(slot.expectedPaths),
      claimedContainer: null,
      overlay: null,
    })),
    done,
    resolveDone,
    deadlineTimer: null,
    finishScheduled: false,
    finished: false,
  };
  registerImageSectionMoveLifecycleHooks(document, transaction.sourcePath, transaction, {
    participantUnloading: (participant) => {
      const slot = transaction.slots.find((candidate) => candidate.container === participant.containerEl);
      if (!slot || slot.overlay || slot.claimedContainer) return;
      slot.overlay = createContinuityOverlay(participant.containerEl);
    },
  });
  const view = document.defaultView;
  if (view) {
    transaction.deadlineTimer = view.setTimeout(
      () => finishTransaction(transaction),
      HOST_REPLACEMENT_DEADLINE_MS,
    );
  }
  return transaction;
}

function scheduleFinishAfterReplacement(transaction: PendingTransaction): void {
  if (transaction.finished || transaction.finishScheduled) return;
  if (!transaction.slots.every((slot) => slot.claimedContainer !== null)) return;
  transaction.finishScheduled = true;
  const view = transaction.document.defaultView;
  if (!view) {
    finishTransaction(transaction);
    return;
  }
  view.requestAnimationFrame(() => finishTransaction(transaction));
}

export function claimImageSectionHostContinuity(
  container: HTMLElement,
  sourcePath: string,
  paths: readonly string[],
  lineStart?: number,
): void {
  const transaction = activeTransactions.get(container.ownerDocument)?.get(sourcePath);
  if (!transaction || transaction.finished) return;
  const expectedKey = pathsKey(paths);
  const candidates = transaction.slots.filter((slot) => (
    slot.claimedContainer === null && slot.expectedKey === expectedKey
  ));
  if (!candidates.length) return;

  const selected = candidates.length === 1 || lineStart === undefined
    ? candidates[0]
    : [...candidates].sort((left, right) => {
      const leftDistance = left.lineStart === undefined
        ? Number.POSITIVE_INFINITY
        : Math.abs(left.lineStart - lineStart);
      const rightDistance = right.lineStart === undefined
        ? Number.POSITIVE_INFINITY
        : Math.abs(right.lineStart - lineStart);
      return leftDistance - rightDistance;
    })[0];

  selected.claimedContainer = container;
  scheduleFinishAfterReplacement(transaction);
}

export async function withImageSectionHostContinuity<T>(
  slots: readonly ImageSectionContinuitySlot[],
  update: () => Promise<T>,
  onUpdated?: (result: T) => void,
): Promise<T> {
  const first = slots[0]?.container;
  const document = first?.ownerDocument;
  if (!first || !document || !document.defaultView
    || slots.some((slot) => slot.container.ownerDocument !== document || slot.sourcePath !== slots[0].sourcePath)) {
    const result = await update();
    onUpdated?.(result);
    return result;
  }

  const transactions = documentTransactions(document);
  const existing = transactions.get(slots[0].sourcePath);
  if (existing) {
    const replacementStarted = existing.slots.some((slot) => slot.overlay || slot.claimedContainer);
    if (replacementStarted) await existing.done;
    else finishTransaction(existing);
  }

  const transaction = createTransaction(slots, document);
  documentTransactions(document).set(transaction.sourcePath, transaction);
  try {
    const result = await update();
    onUpdated?.(result);
    scheduleFinishAfterReplacement(transaction);
    return result;
  } catch (error) {
    finishTransaction(transaction);
    throw error;
  }
}
