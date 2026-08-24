export interface ImageSectionContinuitySlot {
  container: HTMLElement;
  sourcePath: string;
  expectedPaths: readonly string[];
  lineStart?: number;
}

type ContinuityMode = "blocking" | "snapshot-hold";

type HoldableViewTransition = ViewTransition & {
  waitUntil?: (promise: Promise<unknown>) => void;
};

interface PendingSlot extends ImageSectionContinuitySlot {
  name: string;
  expectedKey: string;
  claimedContainer: HTMLElement | null;
  resolveReady: () => void;
  readyPromise: Promise<void>;
}

interface PendingTransaction {
  mode: ContinuityMode;
  slots: PendingSlot[];
  claimed: Promise<void>;
  markClaimed: () => void;
  replacementClaimed: boolean;
  done: Promise<void>;
  resolveDone: () => void;
}

const activeTransactions = new WeakMap<Document, PendingTransaction>();
const HOST_REPLACEMENT_DEADLINE_MS = 3000;
const IMAGE_READINESS_DEADLINE_MS = 1500;
const SNAPSHOT_READY_DEADLINE_MS = 700;
const MAX_CONTINUITY_SLOTS = 2;

function pathsKey(paths: readonly string[]): string {
  return JSON.stringify(paths);
}

function slotName(index: number): string {
  return `al-image-section-${index}`;
}

function setInlineViewTransitionName(element: HTMLElement, value: string): () => void {
  const previous = element.style.getPropertyValue("view-transition-name");
  const priority = element.style.getPropertyPriority("view-transition-name");
  element.style.setProperty("view-transition-name", value);
  return () => {
    if (previous) element.style.setProperty("view-transition-name", previous, priority);
    else element.style.removeProperty("view-transition-name");
  };
}

const CONTINUITY_ACTIVE_CLASS = "al-image-continuity-active";
const SNAPSHOT_HOLD_STYLES = `
html.al-image-continuity-active::view-transition-group(al-image-section-0),
html.al-image-continuity-active::view-transition-group(al-image-section-1),
html.al-image-continuity-active::view-transition-old(al-image-section-0),
html.al-image-continuity-active::view-transition-old(al-image-section-1),
html.al-image-continuity-active::view-transition-new(al-image-section-0),
html.al-image-continuity-active::view-transition-new(al-image-section-1) {
  animation: none;
}
html.al-image-continuity-active::view-transition-old(al-image-section-0),
html.al-image-continuity-active::view-transition-old(al-image-section-1) {
  opacity: 1;
}
html.al-image-continuity-active::view-transition-new(al-image-section-0),
html.al-image-continuity-active::view-transition-new(al-image-section-1) {
  opacity: 0;
}
`;

function prepareSnapshotHold(document: Document): (() => void) | null {
  if (typeof ViewTransition === "undefined"
    || typeof (ViewTransition.prototype as HoldableViewTransition).waitUntil !== "function"
    || typeof CSSStyleSheet === "undefined"
    || typeof CSSStyleSheet.prototype.replaceSync !== "function"
    || !("adoptedStyleSheets" in document)) return null;

  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(SNAPSHOT_HOLD_STYLES);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    const root = document.documentElement;
    const alreadyActive = root.classList.contains(CONTINUITY_ACTIVE_CLASS);
    root.classList.add(CONTINUITY_ACTIVE_CLASS);
    return () => {
      if (!alreadyActive) root.classList.remove(CONTINUITY_ACTIVE_CLASS);
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((candidate) => candidate !== sheet);
    };
  } catch {
    return null;
  }
}

function timeout(view: Window, milliseconds: number): Promise<void> {
  return new Promise((resolve) => view.setTimeout(resolve, milliseconds));
}

function waitForReplacementClaim(
  transaction: PendingTransaction,
  view: Window,
  milliseconds: number,
): Promise<boolean> {
  if (transaction.replacementClaimed) return Promise.resolve(true);
  return Promise.race([
    transaction.claimed.then(() => true),
    timeout(view, milliseconds).then(() => false),
  ]);
}

async function waitForImageReadiness(container: HTMLElement): Promise<void> {
  const images = [...container.querySelectorAll<HTMLImageElement>("img")];
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve) => {
        const settle = (): void => resolve();
        image.addEventListener("load", settle, { once: true });
        image.addEventListener("error", settle, { once: true });
      });
    }
    try {
      await image.decode?.();
    } catch {
      // A failed image is replaced by the renderer's explicit fallback. It is
      // still a settled visual state for continuity purposes.
    }
  }));
}

async function waitForReplacementReadiness(transaction: PendingTransaction, view: Window): Promise<void> {
  if (!await waitForReplacementClaim(transaction, view, HOST_REPLACEMENT_DEADLINE_MS)) return;
  await Promise.race([
    Promise.all(transaction.slots.map((slot) => slot.readyPromise)).then(() => undefined),
    timeout(view, IMAGE_READINESS_DEADLINE_MS),
  ]);
}

function createTransaction(
  slots: readonly ImageSectionContinuitySlot[],
  mode: ContinuityMode,
): PendingTransaction {
  const pendingSlots: PendingSlot[] = slots.map((slot, index) => {
    let resolveReady = (): void => {};
    const readyPromise = new Promise<void>((resolve) => { resolveReady = resolve; });
    return {
      ...slot,
      name: slotName(index),
      expectedKey: pathsKey(slot.expectedPaths),
      claimedContainer: null,
      resolveReady,
      readyPromise,
    };
  });
  let resolveClaimed = (): void => {};
  const claimed = new Promise<void>((resolve) => { resolveClaimed = resolve; });
  let replacementClaimed = false;
  const markClaimed = (): void => {
    if (replacementClaimed) return;
    replacementClaimed = true;
    resolveClaimed();
  };
  let resolveDone = (): void => {};
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  return {
    mode,
    slots: pendingSlots,
    claimed,
    markClaimed,
    get replacementClaimed() { return replacementClaimed; },
    done,
    resolveDone,
  };
}

/**
 * Claims a pending continuity slot for a newly-created Markdown render child.
 * Snapshot-hold transitions keep showing the old compositor snapshot while the
 * replacement renders normally underneath it, so the replacement does not join
 * the already-captured transition. The legacy blocking fallback still assigns
 * the matching transition name before the browser captures its new snapshot.
 */
export function claimImageSectionHostContinuity(
  container: HTMLElement,
  sourcePath: string,
  paths: readonly string[],
  lineStart?: number,
): void {
  const transaction = activeTransactions.get(container.ownerDocument);
  if (!transaction) return;
  const expectedKey = pathsKey(paths);
  const candidates = transaction.slots.filter((slot) => (
    slot.claimedContainer === null
    && slot.sourcePath === sourcePath
    && slot.expectedKey === expectedKey
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
  transaction.markClaimed();
  if (transaction.mode === "blocking") container.style.setProperty("view-transition-name", selected.name);
  const view = container.ownerDocument.defaultView;
  const readiness = waitForImageReadiness(container);
  void (view
    ? Promise.race([readiness, timeout(view, SNAPSHOT_READY_DEADLINE_MS)])
    : readiness
  ).finally(selected.resolveReady);
}

async function runBlockingContinuity<T>(
  transaction: PendingTransaction,
  document: Document,
  view: Window,
  update: () => Promise<T>,
): Promise<T> {
  let result!: T;
  let transition: ViewTransition | null = null;
  let updateStarted = false;
  try {
    transition = document.startViewTransition(async () => {
      updateStarted = true;
      result = await update();
      await waitForReplacementReadiness(transaction, view);
    });
  } catch (error) {
    if (!updateStarted) return update();
    throw error;
  }
  try {
    await transition.updateCallbackDone;
  } catch (error) {
    if (!updateStarted) return update();
    throw error;
  }
  try {
    await transition.ready;
    transition.skipTransition();
  } catch {
    // Duplicate names or browser cancellation must never turn a successful
    // Markdown persistence operation into a functional error.
  }
  await transition.finished.catch(() => undefined);
  return result;
}

/**
 * Captures the already-reordered Image Section, immediately ends the view
 * transition update callback so document rendering resumes, and then performs
 * Markdown persistence while the old section snapshot remains in the compositor
 * overlay. The replacement renderer is allowed to mount and decode underneath
 * that snapshot; the pseudo-element tree is released only after the replacement
 * is ready. This avoids both the raw-host flash and the document-wide rendering
 * suppression caused by waiting inside an async startViewTransition callback.
 */
async function runSnapshotHoldContinuity<T>(
  transaction: PendingTransaction,
  document: Document,
  view: Window,
  update: () => Promise<T>,
): Promise<T> {
  let transition: HoldableViewTransition;
  try {
    transition = document.startViewTransition(() => undefined) as HoldableViewTransition;
  } catch {
    return update();
  }
  if (typeof transition.waitUntil !== "function") {
    transition.skipTransition();
    await transition.finished.catch(() => undefined);
    return update();
  }

  let releaseSnapshot = (): void => {};
  const snapshotLifetime = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
  transition.waitUntil(snapshotLifetime);

  try {
    await transition.ready;
  } catch {
    releaseSnapshot();
    await transition.finished.catch(() => undefined);
    return update();
  }

  try {
    const result = await update();
    await waitForReplacementReadiness(transaction, view);
    return result;
  } finally {
    releaseSnapshot();
    await transition.finished.catch(() => undefined);
  }
}

/**
 * Runs Markdown persistence as an Image Section compositor continuity
 * transaction. Modern Chromium keeps only the section snapshot alive while the
 * rest of the document continues rendering. Browsers without ViewTransition
 * waitUntil() keep the previous blocking behavior rather than regressing to a
 * visible raw Markdown host.
 */
export async function withImageSectionHostContinuity<T>(
  slots: readonly ImageSectionContinuitySlot[],
  update: () => Promise<T>,
): Promise<T> {
  const first = slots[0]?.container;
  const document = first?.ownerDocument;
  const view = document?.defaultView;
  const supportsViewTransition = Boolean(document && typeof document.startViewTransition === "function");
  if (!first || !document || !view || !supportsViewTransition
    || slots.length > MAX_CONTINUITY_SLOTS
    || slots.some((slot) => slot.container.ownerDocument !== document)) {
    return update();
  }

  const active = activeTransactions.get(document);
  if (active) {
    await active.done.catch(() => undefined);
    return withImageSectionHostContinuity(slots, update);
  }

  const restoreSnapshotHold = prepareSnapshotHold(document);
  const mode: ContinuityMode = restoreSnapshotHold ? "snapshot-hold" : "blocking";
  const transaction = createTransaction(slots, mode);
  const restoreRoot = setInlineViewTransitionName(document.documentElement, "none");
  const restoreOldNames = transaction.slots.map((slot) => setInlineViewTransitionName(slot.container, slot.name));
  activeTransactions.set(document, transaction);

  try {
    return mode === "snapshot-hold"
      ? await runSnapshotHoldContinuity(transaction, document, view, update)
      : await runBlockingContinuity(transaction, document, view, update);
  } finally {
    if (activeTransactions.get(document) === transaction) activeTransactions.delete(document);
    transaction.resolveDone();
    restoreOldNames.forEach((restore) => restore());
    for (const slot of transaction.slots) {
      const replacement = slot.claimedContainer;
      if (replacement && replacement !== slot.container) replacement.style.removeProperty("view-transition-name");
    }
    restoreSnapshotHold?.();
    restoreRoot();
  }
}
