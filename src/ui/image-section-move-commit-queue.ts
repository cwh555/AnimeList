import type { ImageSectionService } from "../data/image-section-service";
import type { ImageSectionLocator } from "../domain/image-section";
import type { ImageSectionStateUpdate } from "../domain/image-section-order";
import {
  registerImageSectionMoveLifecycleHooks,
  unregisterImageSectionMoveLifecycleHooks,
  type ImageSectionMoveLifecycleParticipant,
} from "./image-section-move-lifecycle";

export interface ImageSectionCommitParticipant {
  readonly containerEl: HTMLElement;
  readonly sourcePath: string;
  paths(): readonly string[];
  locator(): ImageSectionLocator;
  ownsContainer(): boolean;
  applyPaths(paths: readonly string[], renderEmpty?: boolean): void;
  applyState(update: ImageSectionStateUpdate): void;
  preparePersistedRefresh(): void;
}

export type ImageSectionMoveOutcome =
  | { status: "moved" }
  | { status: "unchanged" }
  | { status: "unsupported" }
  | { status: "failed"; error: unknown };

interface PendingSectionCommit {
  participant: ImageSectionCommitParticipant;
  baselinePaths: string[];
  desiredPaths: string[];
}

interface PendingCommitBatch {
  service: ImageSectionService;
  sourcePath: string;
  document: Document;
  sections: Map<ImageSectionCommitParticipant, PendingSectionCommit>;
  waiters: Array<(outcome: ImageSectionMoveOutcome) => void>;
  activeInteractions: number;
  pendingLayouts: number;
  timer: number | null;
  flushing: boolean;
  waitingForPredecessor: boolean;
}

export interface QueueImageSectionMoveCommitRequest {
  service: ImageSectionService;
  source: ImageSectionCommitParticipant;
  target: ImageSectionCommitParticipant;
  sourceBefore: readonly string[];
  targetBefore: readonly string[];
  sourceAfter: readonly string[];
  targetAfter: readonly string[];
  sameSection: boolean;
  layout: Promise<void>;
}

const MOVE_COMMIT_IDLE_MS = 300;
const commitBatches = new WeakMap<ImageSectionService, Map<string, PendingCommitBatch>>();
const inFlightCommits = new WeakMap<ImageSectionService, Map<string, Promise<ImageSectionMoveOutcome>>>();

function inFlightFor(service: ImageSectionService, sourcePath: string): Promise<ImageSectionMoveOutcome> | null {
  return inFlightCommits.get(service)?.get(sourcePath) ?? null;
}

function trackInFlight(
  service: ImageSectionService,
  sourcePath: string,
  operation: Promise<ImageSectionMoveOutcome>,
): void {
  let commits = inFlightCommits.get(service);
  if (!commits) {
    commits = new Map();
    inFlightCommits.set(service, commits);
  }
  commits.set(sourcePath, operation);
  void operation.finally(() => {
    const current = inFlightCommits.get(service);
    if (!current || current.get(sourcePath) !== operation) return;
    current.delete(sourcePath);
    if (current.size === 0) inFlightCommits.delete(service);
  });
}

function serviceBatches(service: ImageSectionService): Map<string, PendingCommitBatch> {
  let batches = commitBatches.get(service);
  if (!batches) {
    batches = new Map();
    commitBatches.set(service, batches);
  }
  return batches;
}

function ensureBatch(
  service: ImageSectionService,
  participant: ImageSectionCommitParticipant,
): PendingCommitBatch {
  const batches = serviceBatches(service);
  const existing = batches.get(participant.sourcePath);
  if (existing && !existing.flushing) return existing;
  const batch: PendingCommitBatch = {
    service,
    sourcePath: participant.sourcePath,
    document: participant.containerEl.ownerDocument,
    sections: new Map(),
    waiters: [],
    activeInteractions: 0,
    pendingLayouts: 0,
    timer: null,
    flushing: false,
    waitingForPredecessor: false,
  };
  batches.set(participant.sourcePath, batch);
  registerBatchLifecycle(batch);
  return batch;
}

function adoptParticipantInBatch(
  batch: PendingCommitBatch,
  participant: ImageSectionMoveLifecycleParticipant,
): boolean {
  if (batch.flushing) return false;
  const persistedPaths = [...participant.paths()];
  const candidates = [...batch.sections.values()].filter((section) => (
    samePathOrder(section.baselinePaths, persistedPaths)
  ));
  if (!candidates.length) return false;

  const lineStart = participant.locator().lineStart;
  const selected = candidates.length === 1 || lineStart === undefined
    ? candidates[0]
    : [...candidates].sort((left, right) => {
      const leftLine = left.participant.locator().lineStart;
      const rightLine = right.participant.locator().lineStart;
      const leftDistance = leftLine === undefined ? Number.POSITIVE_INFINITY : Math.abs(leftLine - lineStart);
      const rightDistance = rightLine === undefined ? Number.POSITIVE_INFINITY : Math.abs(rightLine - lineStart);
      return leftDistance - rightDistance;
    })[0];

  const nextParticipant = participant as ImageSectionCommitParticipant;
  if (selected.participant !== nextParticipant) {
    batch.sections.delete(selected.participant);
    selected.participant = nextParticipant;
    batch.sections.set(nextParticipant, selected);
  }
  nextParticipant.applyPaths(selected.desiredPaths);
  scheduleBatch(batch);
  return true;
}

function registerBatchLifecycle(batch: PendingCommitBatch): void {
  registerImageSectionMoveLifecycleHooks(batch.document, batch.sourcePath, batch, {
    participantRegistered: (participant) => { void adoptParticipantInBatch(batch, participant); },
    interactionStarted: () => {
      if (batch.flushing) return;
      batch.activeInteractions += 1;
      clearBatchTimer(batch);
    },
    interactionEnded: () => {
      if (batch.flushing) return;
      batch.activeInteractions = Math.max(0, batch.activeInteractions - 1);
      scheduleBatch(batch);
    },
  });
}

function unregisterBatchLifecycle(batch: PendingCommitBatch): void {
  unregisterImageSectionMoveLifecycleHooks(batch.document, batch.sourcePath, batch);
}

function removeBatch(batch: PendingCommitBatch): void {
  const batches = commitBatches.get(batch.service);
  if (!batches || batches.get(batch.sourcePath) !== batch) return;
  batches.delete(batch.sourcePath);
  unregisterBatchLifecycle(batch);
  if (batches.size === 0) commitBatches.delete(batch.service);
}

function samePathOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function failWaitingBatch(batch: PendingCommitBatch, outcome: ImageSectionMoveOutcome): void {
  clearBatchTimer(batch);
  removeBatch(batch);
  resolveBatch(batch, outcome);
}

function clearBatchTimer(batch: PendingCommitBatch): void {
  if (batch.timer === null) return;
  batch.document.defaultView?.clearTimeout(batch.timer);
  batch.timer = null;
}

function scheduleBatch(batch: PendingCommitBatch): void {
  clearBatchTimer(batch);
  if (batch.flushing || batch.sections.size === 0 || batch.activeInteractions > 0 || batch.pendingLayouts > 0) return;

  const predecessor = inFlightFor(batch.service, batch.sourcePath);
  if (predecessor !== null) {
    if (batch.waitingForPredecessor) return;
    batch.waitingForPredecessor = true;
    void predecessor.then((outcome) => {
      batch.waitingForPredecessor = false;
      if (outcome.status === "failed") {
        failWaitingBatch(batch, outcome);
        return;
      }
      const view = batch.document.defaultView;
      if (view) view.setTimeout(() => scheduleBatch(batch), 0);
      else scheduleBatch(batch);
    });
    return;
  }

  const view = batch.document.defaultView;
  if (!view) {
    void flushBatch(batch);
    return;
  }
  batch.timer = view.setTimeout(() => {
    batch.timer = null;
    void flushBatch(batch);
  }, MOVE_COMMIT_IDLE_MS);
}

function registerSection(
  batch: PendingCommitBatch,
  participant: ImageSectionCommitParticipant,
  baselinePaths: readonly string[],
  desiredPaths: readonly string[],
): void {
  const existing = batch.sections.get(participant);
  if (existing) {
    existing.desiredPaths = [...desiredPaths];
    return;
  }
  batch.sections.set(participant, {
    participant,
    baselinePaths: [...baselinePaths],
    desiredPaths: [...desiredPaths],
  });
}

function registerLayout(batch: PendingCommitBatch, layout: Promise<void>): void {
  batch.pendingLayouts += 1;
  void layout.finally(() => {
    batch.pendingLayouts = Math.max(0, batch.pendingLayouts - 1);
    scheduleBatch(batch);
  });
}

function resolveBatch(batch: PendingCommitBatch, outcome: ImageSectionMoveOutcome): void {
  for (const resolve of batch.waiters.splice(0)) resolve(outcome);
}

function rollbackBatch(batch: PendingCommitBatch): void {
  for (const section of batch.sections.values()) {
    if (section.participant.ownsContainer()) section.participant.applyPaths(section.baselinePaths);
  }
}

async function flushBatch(batch: PendingCommitBatch): Promise<ImageSectionMoveOutcome> {
  if (batch.flushing || batch.sections.size === 0) return { status: "unchanged" };
  batch.flushing = true;
  clearBatchTimer(batch);
  removeBatch(batch);

  const predecessor = inFlightFor(batch.service, batch.sourcePath);
  if (predecessor !== null) {
    batch.flushing = false;
    serviceBatches(batch.service).set(batch.sourcePath, batch);
    registerBatchLifecycle(batch);
    scheduleBatch(batch);
    return { status: "unchanged" };
  }

  const operation = (async (): Promise<ImageSectionMoveOutcome> => {
    const sections = [...batch.sections.values()];
    const replacements = sections.map((section) => ({
      locator: section.participant.locator(),
      expectedPaths: section.baselinePaths,
      paths: section.desiredPaths,
    }));
    let stateApplied = false;
    const applyPersistedState = (states: ImageSectionStateUpdate[]): void => {
      if (stateApplied) return;
      stateApplied = true;
      states.forEach((state, index) => {
        const participant = sections[index]?.participant;
        if (participant?.ownsContainer()) participant.applyState(state);
      });
    };

    try {
      for (const section of sections) section.participant.preparePersistedRefresh();
      const states = await batch.service.setSectionOrders(batch.sourcePath, replacements);
      applyPersistedState(states);
      const outcome: ImageSectionMoveOutcome = { status: "moved" };
      resolveBatch(batch, outcome);
      return outcome;
    } catch (error) {
      rollbackBatch(batch);
      const outcome: ImageSectionMoveOutcome = { status: "failed", error };
      resolveBatch(batch, outcome);
      return outcome;
    }
  })();
  trackInFlight(batch.service, batch.sourcePath, operation);
  return operation;
}

export function queueImageSectionMoveCommit(
  request: QueueImageSectionMoveCommitRequest,
): Promise<ImageSectionMoveOutcome> {
  const {
    service,
    source,
    target,
    sourceBefore,
    targetBefore,
    sourceAfter,
    targetAfter,
    sameSection,
    layout,
  } = request;
  const batch = ensureBatch(service, source);
  registerSection(batch, source, sourceBefore, sourceAfter);
  if (!sameSection) registerSection(batch, target, targetBefore, targetAfter);
  registerLayout(batch, layout);
  const outcome = new Promise<ImageSectionMoveOutcome>((resolve) => batch.waiters.push(resolve));
  scheduleBatch(batch);
  return outcome;
}
