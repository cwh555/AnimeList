export interface ImageSectionContinuitySlot {
  container: HTMLElement;
  sourcePath: string;
  expectedPaths: readonly string[];
  lineStart?: number;
}

interface PendingSlot extends ImageSectionContinuitySlot {
  name: string;
  expectedKey: string;
  claimedContainer: HTMLElement | null;
  resolveReady: () => void;
  readyPromise: Promise<void>;
}

interface PendingTransaction {
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
let nextTransitionId = 1;

function pathsKey(paths: readonly string[]): string {
  return JSON.stringify(paths);
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

/**
 * Claims a pending compositor continuity slot for a newly-created Markdown
 * render child. The claim is made only after the replacement gallery has been
 * rendered, so the View Transition captures a complete new section rather than
 * the host's intermediate raw/empty code-block surface.
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
  container.style.setProperty("view-transition-name", selected.name);
  const view = container.ownerDocument.defaultView;
  const readiness = waitForImageReadiness(container);
  void (view
    ? Promise.race([readiness, timeout(view, 700)])
    : readiness
  ).finally(selected.resolveReady);
}

/**
 * Runs Markdown persistence as a section-scoped compositor transaction.
 *
 * Obsidian can temporarily replace an `animelist-images` render child with its
 * raw/empty host while the code-block processor is recreated. A same-document
 * View Transition keeps the already-reordered section snapshot on screen until
 * the replacement renderer claims the matching slot. The transition is then
 * skipped immediately: this is continuity, not an extra visual animation.
 */
export async function withImageSectionHostContinuity<T>(
  slots: readonly ImageSectionContinuitySlot[],
  update: () => Promise<T>,
): Promise<T> {
  const first = slots[0]?.container;
  const document = first?.ownerDocument;
  const view = document?.defaultView;
  const supportsViewTransition = Boolean(document && typeof document.startViewTransition === "function");
  if (!first || !document || !view || !supportsViewTransition || slots.some((slot) => slot.container.ownerDocument !== document)) {
    return update();
  }

  // Serialize our own section transactions instead of falling back to an
  // unprotected Markdown write. This matters for rapid consecutive moves: the
  // second persistence waits for the first compositor handoff to finish.
  const active = activeTransactions.get(document);
  if (active) {
    await active.done.catch(() => undefined);
    return withImageSectionHostContinuity(slots, update);
  }

  const transactionId = nextTransitionId++;
  const pendingSlots: PendingSlot[] = slots.map((slot, index) => {
    let resolveReady = (): void => {};
    const readyPromise = new Promise<void>((resolve) => { resolveReady = resolve; });
    return {
      ...slot,
      name: `al-image-section-${transactionId}-${index}`,
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
  const transaction: PendingTransaction = {
    slots: pendingSlots,
    claimed,
    markClaimed,
    get replacementClaimed() { return replacementClaimed; },
    done,
    resolveDone,
  };
  const restoreRoot = setInlineViewTransitionName(document.documentElement, "none");
  const restoreOldNames = pendingSlots.map((slot) => setInlineViewTransitionName(slot.container, slot.name));
  activeTransactions.set(document, transaction);

  let result!: T;
  let transition: ViewTransition | null = null;
  let updateStarted = false;
  try {
    try {
      transition = document.startViewTransition(async () => {
        updateStarted = true;
        result = await update();
        // Markdown preview invalidation is asynchronous relative to
        // `vault.process()`. Keep the already-reordered compositor snapshot
        // until the replacement ImageSection render child itself claims this
        // transaction. The raw/empty host may exist in the DOM in between, but
        // never receives a paint opportunity. The bound is only a safety escape
        // if the host never recreates this render child.
        if (!await waitForReplacementClaim(transaction, view, HOST_REPLACEMENT_DEADLINE_MS)) return;
        await Promise.race([
          Promise.all(pendingSlots.map((slot) => slot.readyPromise)).then(() => undefined),
          timeout(view, IMAGE_READINESS_DEADLINE_MS),
        ]);
      });
    } catch (error) {
      if (!updateStarted) {
        activeTransactions.delete(document);
        restoreOldNames.forEach((restore) => restore());
        restoreRoot();
        transaction.resolveDone();
        return update();
      }
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
  } finally {
    if (activeTransactions.get(document) === transaction) activeTransactions.delete(document);
    transaction.resolveDone();
    restoreOldNames.forEach((restore) => restore());
    for (const slot of pendingSlots) {
      const replacement = slot.claimedContainer;
      if (replacement && replacement !== slot.container) replacement.style.removeProperty("view-transition-name");
    }
    restoreRoot();
  }
}
