import {
  parkImageSectionSurface,
  type ImageSectionSurfaceHandoff,
  type ReusableImageSectionImage,
} from "./image-section-surface-handoff";

export type { ReusableImageSectionImage } from "./image-section-surface-handoff";

interface PendingHandoff {
  document: Document;
  sourcePath: string;
  sourceContainer: HTMLElement;
  pathsKey: string;
  lineStart?: number;
  ancestors: HTMLElement[];
  sourceRect: DOMRectReadOnly;
  observer: MutationObserver | null;
  surface: ImageSectionSurfaceHandoff | null;
  deadlineTimer: number | null;
  finished: boolean;
}

const pendingByDocument = new WeakMap<Document, Map<string, PendingHandoff[]>>();
const PERSISTED_REFRESH_ARM_DEADLINE_MS = 1500;
const UNCLAIMED_SURFACE_DEADLINE_MS = 700;

function keyForPaths(paths: readonly string[]): string {
  return JSON.stringify(paths);
}

function handoffsForDocument(document: Document): Map<string, PendingHandoff[]> {
  let byPath = pendingByDocument.get(document);
  if (!byPath) {
    byPath = new Map();
    pendingByDocument.set(document, byPath);
  }
  return byPath;
}

function ancestorChain(container: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let current = container.parentElement;
  while (current) {
    ancestors.push(current);
    current = current.parentElement;
  }
  return ancestors;
}

function observationRootFor(handoff: PendingHandoff): Node | null {
  const markdownRoot = handoff.sourceContainer.closest<HTMLElement>(
    ".markdown-preview-view, .markdown-reading-view, .markdown-rendered",
  );
  if (markdownRoot?.isConnected) return markdownRoot;
  const documentElement = handoff.document.documentElement;
  return documentElement?.contains(handoff.sourceContainer) ? documentElement : null;
}

function removeHandoff(handoff: PendingHandoff): void {
  const byPath = pendingByDocument.get(handoff.document);
  const handoffs = byPath?.get(handoff.sourcePath);
  if (!byPath || !handoffs) return;
  const index = handoffs.indexOf(handoff);
  if (index >= 0) handoffs.splice(index, 1);
  if (handoffs.length === 0) byPath.delete(handoff.sourcePath);
  if (byPath.size === 0) pendingByDocument.delete(handoff.document);
}

function finishHandoff(handoff: PendingHandoff): void {
  if (handoff.finished) return;
  handoff.finished = true;
  handoff.observer?.disconnect();
  handoff.observer = null;
  const view = handoff.document.defaultView;
  if (handoff.deadlineTimer !== null) view?.clearTimeout(handoff.deadlineTimer);
  handoff.deadlineTimer = null;
  removeHandoff(handoff);
  handoff.surface?.release();
  handoff.surface = null;
}

function scheduleUnclaimedSurfaceDeadline(handoff: PendingHandoff): void {
  const view = handoff.document.defaultView;
  if (!view || handoff.deadlineTimer !== null) return;
  handoff.deadlineTimer = view.setTimeout(
    () => finishHandoff(handoff),
    UNCLAIMED_SURFACE_DEADLINE_MS,
  );
}

function activateHandoff(handoff: PendingHandoff): void {
  if (handoff.finished || handoff.surface) return;
  handoff.observer?.disconnect();
  handoff.observer = null;
  const surface = parkImageSectionSurface(
    handoff.sourceContainer,
    handoff.ancestors,
    handoff.sourceRect,
  );
  if (!surface) {
    finishHandoff(handoff);
    return;
  }
  handoff.surface = surface;
  const view = handoff.document.defaultView;
  if (handoff.deadlineTimer !== null) view?.clearTimeout(handoff.deadlineTimer);
  handoff.deadlineTimer = null;
  scheduleUnclaimedSurfaceDeadline(handoff);
}

function createPendingHandoff(
  container: HTMLElement,
  sourcePath: string,
  paths: readonly string[],
  lineStart?: number,
): PendingHandoff | null {
  const document = container.ownerDocument;
  const view = document.defaultView;
  if (!view || !container.isConnected) return null;
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const byPath = handoffsForDocument(document);
  const handoffs = byPath.get(sourcePath) ?? [];
  const existing = handoffs.find((handoff) => !handoff.finished && handoff.sourceContainer === container);
  if (existing) {
    existing.pathsKey = keyForPaths(paths);
    existing.lineStart = lineStart;
    existing.ancestors = ancestorChain(container);
    existing.sourceRect = rect;
    return existing;
  }

  const handoff: PendingHandoff = {
    document,
    sourcePath,
    sourceContainer: container,
    pathsKey: keyForPaths(paths),
    lineStart,
    ancestors: ancestorChain(container),
    sourceRect: rect,
    observer: null,
    surface: null,
    deadlineTimer: null,
    finished: false,
  };
  handoffs.push(handoff);
  byPath.set(sourcePath, handoffs);
  return handoff;
}

/**
 * Arms continuity before a persisted Markdown write. The observer only exists
 * for the refresh window. If Obsidian detaches the source first, the old
 * surface is parked before the browser paints the raw/replacement host.
 */
export function armImageSectionHostContinuity(
  container: HTMLElement,
  sourcePath: string,
  paths: readonly string[],
  lineStart?: number,
): void {
  const handoff = createPendingHandoff(container, sourcePath, paths, lineStart);
  const view = container.ownerDocument.defaultView;
  if (!handoff || !view || handoff.surface) return;
  if (handoff.observer) {
    if (handoff.deadlineTimer !== null) view.clearTimeout(handoff.deadlineTimer);
    handoff.deadlineTimer = view.setTimeout(
      () => finishHandoff(handoff),
      PERSISTED_REFRESH_ARM_DEADLINE_MS,
    );
    return;
  }

  const observationRoot = observationRootFor(handoff);
  if (!observationRoot) {
    finishHandoff(handoff);
    return;
  }
  handoff.observer = new MutationObserver(() => {
    if (!handoff.sourceContainer.isConnected) activateHandoff(handoff);
  });
  handoff.observer.observe(observationRoot, { childList: true, subtree: true });
  handoff.deadlineTimer = view.setTimeout(
    () => finishHandoff(handoff),
    PERSISTED_REFRESH_ARM_DEADLINE_MS,
  );
}

/** Parks immediately for same-container renderer rebinds before DOM mutation. */
export function prepareImageSectionHostContinuity(
  container: HTMLElement,
  sourcePath: string,
  paths: readonly string[],
  lineStart?: number,
): void {
  const handoff = createPendingHandoff(container, sourcePath, paths, lineStart);
  if (!handoff) return;
  activateHandoff(handoff);
}

function lineDistance(handoff: PendingHandoff, lineStart: number | undefined): number {
  if (lineStart === undefined || handoff.lineStart === undefined) return Number.POSITIVE_INFINITY;
  return Math.abs(handoff.lineStart - lineStart);
}

function closestByLine(
  handoffs: readonly PendingHandoff[],
  lineStart: number | undefined,
): PendingHandoff {
  if (handoffs.length === 1 || lineStart === undefined) return handoffs[0];
  return [...handoffs].sort((left, right) => (
    lineDistance(left, lineStart) - lineDistance(right, lineStart)
  ))[0];
}

function selectPendingHandoff(
  container: HTMLElement,
  sourcePath: string,
  paths: readonly string[],
  lineStart?: number,
): PendingHandoff | null {
  const handoffs = pendingByDocument.get(container.ownerDocument)?.get(sourcePath)
    ?.filter((handoff) => !handoff.finished) ?? [];
  if (handoffs.length === 0) return null;

  const sameContainer = handoffs.find((handoff) => handoff.sourceContainer === container);
  if (sameContainer) return sameContainer;

  const pathsKey = keyForPaths(paths);
  const samePaths = handoffs.filter((handoff) => handoff.pathsKey === pathsKey);
  if (samePaths.length > 0) return closestByLine(samePaths, lineStart);
  return closestByLine(handoffs, lineStart);
}

/**
 * Claims a predecessor synchronously. The parked surface is destroyed before
 * this function returns, so the successor may render without ever overlapping
 * a second complete Image Section. Reusable image nodes survive the handoff and
 * can be moved directly into the successor DOM.
 */
export function claimImageSectionHostContinuity(
  container: HTMLElement,
  sourcePath: string,
  paths: readonly string[],
  lineStart?: number,
): ReusableImageSectionImage[] {
  const handoff = selectPendingHandoff(container, sourcePath, paths, lineStart);
  if (!handoff) return [];

  if (!handoff.surface) activateHandoff(handoff);
  const reusable = handoff.surface?.takeReusableImages() ?? [];
  finishHandoff(handoff);
  return reusable;
}
