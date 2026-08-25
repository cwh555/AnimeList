import {
  captureImageSectionVisualHandoff,
  IMAGE_SECTION_VISUAL_READY_DEADLINE_MS,
  waitForImageSectionVisualReady,
  type ImageSectionVisualHandoff,
} from "./image-section-visual-handoff";

interface PendingHandoff {
  document: Document;
  sourcePath: string;
  sourceContainer: HTMLElement;
  pathsKey: string;
  lineStart?: number;
  visual: ImageSectionVisualHandoff;
  claimed: boolean;
  deadlineTimer: number | null;
  finished: boolean;
}

const pendingByDocument = new WeakMap<Document, Map<string, PendingHandoff[]>>();
const UNCLAIMED_HANDOFF_DEADLINE_MS = IMAGE_SECTION_VISUAL_READY_DEADLINE_MS;

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
  const view = handoff.document.defaultView;
  if (handoff.deadlineTimer !== null) view?.clearTimeout(handoff.deadlineTimer);
  handoff.deadlineTimer = null;
  removeHandoff(handoff);
  handoff.visual.release();
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
    ?.filter((handoff) => !handoff.finished && !handoff.claimed) ?? [];
  if (handoffs.length === 0) return null;

  const sameContainer = handoffs.find((handoff) => handoff.sourceContainer === container);
  if (sameContainer) return sameContainer;

  const pathsKey = keyForPaths(paths);
  const samePaths = handoffs.filter((handoff) => handoff.pathsKey === pathsKey);
  if (samePaths.length > 0) return closestByLine(samePaths, lineStart);

  return closestByLine(handoffs, lineStart);
}

export function prepareImageSectionHostContinuity(
  container: HTMLElement,
  sourcePath: string,
  paths: readonly string[],
  lineStart?: number,
): void {
  const document = container.ownerDocument;
  const view = document.defaultView;
  if (!view || !container.isConnected) return;

  const byPath = handoffsForDocument(document);
  const handoffs = byPath.get(sourcePath) ?? [];
  if (handoffs.some((handoff) => !handoff.finished && handoff.sourceContainer === container)) return;

  const visual = captureImageSectionVisualHandoff(container);
  if (!visual) return;
  const handoff: PendingHandoff = {
    document,
    sourcePath,
    sourceContainer: container,
    pathsKey: keyForPaths(paths),
    lineStart,
    visual,
    claimed: false,
    deadlineTimer: null,
    finished: false,
  };
  handoffs.push(handoff);
  byPath.set(sourcePath, handoffs);
  handoff.deadlineTimer = view.setTimeout(
    () => finishHandoff(handoff),
    UNCLAIMED_HANDOFF_DEADLINE_MS,
  );
}

export function claimImageSectionHostContinuity(
  container: HTMLElement,
  sourcePath: string,
  paths: readonly string[],
  lineStart?: number,
): void {
  const handoff = selectPendingHandoff(container, sourcePath, paths, lineStart);
  if (!handoff) return;

  handoff.claimed = true;
  const view = handoff.document.defaultView;
  if (handoff.deadlineTimer !== null) view?.clearTimeout(handoff.deadlineTimer);
  handoff.deadlineTimer = null;
  void waitForImageSectionVisualReady(container)
    .finally(() => finishHandoff(handoff));
}
