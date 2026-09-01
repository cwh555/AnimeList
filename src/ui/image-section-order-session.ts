import type { ImageSectionLocator } from "../domain/image-section";
import {
  classifyImageSectionPendingOrder,
  type ImageSectionPendingOrder,
} from "../domain/image-section-order";
import type {
  ImageSectionOrderJournalRecord,
  ImageSectionOrderJournalSection,
  ImageSectionOrderJournalStore,
} from "../data/image-section-order-journal";

export type ImageSectionMoveOutcome =
  | { status: "moved" }
  | { status: "unchanged" }
  | { status: "unsupported" }
  | { status: "failed"; error: unknown };

export interface ImageSectionOrderParticipant {
  readonly containerEl: HTMLElement;
  readonly sourcePath: string;
  canonicalPaths(): readonly string[];
  paths(): readonly string[];
  locator(): ImageSectionLocator;
  ownsContainer(): boolean;
  applyPaths(paths: readonly string[], renderEmpty?: boolean): void;
}

export interface ImageSectionPendingOrderCommitter {
  commitPendingSectionOrders(sourcePath: string, pending: readonly ImageSectionPendingOrder[]): Promise<void>;
}

interface MoveRecordRequest {
  source: ImageSectionOrderParticipant;
  target: ImageSectionOrderParticipant;
  sourceAfter: readonly string[];
  targetAfter: readonly string[];
  sameSection: boolean;
}

interface PendingWaiter {
  version: number;
  resolve(outcome: ImageSectionMoveOutcome): void;
}

interface NoteState {
  sourcePath: string;
  record: ImageSectionOrderJournalRecord | null;
  durable: ImageSectionOrderJournalRecord | null;
  participants: Set<ImageSectionOrderParticipant>;
  version: number;
  persistedVersion: number;
  writeScheduled: boolean;
  writing: boolean;
  waiters: PendingWaiter[];
  flushTimer: number | null;
  flushView: Window | null;
  flushingCanonical: boolean;
  sectionSerial: number;
  renamedJournalPaths: Set<string>;
  cleaningRenamedJournals: boolean;
}

const ABSENCE_FLUSH_DELAY_MS = 600;

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function cloneRecord(record: ImageSectionOrderJournalRecord | null): ImageSectionOrderJournalRecord | null {
  if (!record) return null;
  return {
    version: 1,
    sourcePath: record.sourcePath,
    updatedAt: record.updatedAt,
    sections: record.sections.map((section) => ({
      id: section.id,
      lineStart: section.lineStart,
      expectedPaths: [...section.expectedPaths],
      paths: [...section.paths],
    })),
  };
}

function matchingSection(
  record: ImageSectionOrderJournalRecord | null,
  canonicalPaths: readonly string[],
  lineStart: number | undefined,
): ImageSectionOrderJournalSection | null {
  if (!record) return null;
  const hint = typeof lineStart === "number" ? lineStart : null;
  const candidates = record.sections
    .map((section, index) => {
      const status = classifyImageSectionPendingOrder(canonicalPaths, section);
      if (status === "conflict") return null;
      const distance = hint === null || section.lineStart === undefined
        ? index
        : Math.abs(section.lineStart - hint);
      return { section, distance, status };
    })
    .filter((entry): entry is {
      section: ImageSectionOrderJournalSection;
      distance: number;
      status: "pending" | "committed";
    } => Boolean(entry));
  candidates.sort((left, right) => left.distance - right.distance || Number(right.status === "pending") - Number(left.status === "pending"));
  return candidates[0]?.section ?? null;
}

export class ImageSectionOrderSession {
  private readonly notes = new Map<string, NoteState>();
  private readonly pathAliases = new Map<string, string>();
  private readonly participantSections = new WeakMap<ImageSectionOrderParticipant, string>();
  private disposed = false;

  constructor(
    private readonly journal: ImageSectionOrderJournalStore,
    private readonly committer: ImageSectionPendingOrderCommitter,
  ) {}

  async initialize(): Promise<void> {
    const records = await this.journal.loadAll();
    for (const record of records) {
      this.notes.set(record.sourcePath, this.createState(record.sourcePath, record));
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const state of this.notes.values()) {
      if (state.flushTimer !== null) state.flushView?.clearTimeout(state.flushTimer);
      state.flushTimer = null;
      state.flushView = null;
      for (const waiter of state.waiters.splice(0)) {
        waiter.resolve({ status: "failed", error: new Error("Image section order session disposed") });
      }
    }
    this.pathAliases.clear();
  }

  renameSource(oldPath: string, newPath: string): void {
    const previousPath = this.resolveSourcePath(oldPath);
    const nextPath = this.resolveSourcePath(newPath);
    if (!previousPath || !nextPath || previousPath === nextPath) return;
    const state = this.notes.get(previousPath);
    if (!state) return;

    const destination = this.notes.get(nextPath);
    if (destination && destination !== state) {
      console.warn("AnimeList image order state already exists at renamed note path; keeping the active source state", {
        oldPath: previousPath,
        newPath: nextPath,
      });
      this.notes.delete(nextPath);
    }

    this.notes.delete(previousPath);
    this.notes.set(nextPath, state);
    this.pathAliases.set(previousPath, nextPath);
    state.sourcePath = nextPath;
    state.renamedJournalPaths.add(previousPath);

    if (state.record) {
      state.record.sourcePath = nextPath;
      state.record.updatedAt = Date.now();
      state.version += 1;
      this.schedulePersist(state);
    } else {
      this.cleanupRenamedJournals(state);
    }
  }

  register(participant: ImageSectionOrderParticipant): readonly string[] {
    const state = this.stateFor(participant.sourcePath);
    state.participants.add(participant);
    if (state.flushTimer !== null) state.flushView?.clearTimeout(state.flushTimer);
    state.flushTimer = null;
    state.flushView = null;

    const canonical = [...participant.canonicalPaths()];
    const section = matchingSection(state.record, canonical, participant.locator().lineStart);
    if (!section) return canonical;
    if (samePaths(section.paths, canonical)) {
      this.removeSection(state, section.id);
      this.persistCanonicalCleanup(state);
      return canonical;
    }
    this.participantSections.set(participant, section.id);
    return [...section.paths];
  }

  unregister(participant: ImageSectionOrderParticipant): void {
    const state = this.stateForExistingPath(participant.sourcePath);
    if (!state) return;
    state.participants.delete(participant);
    if (state.participants.size > 0 || !state.record?.sections.length || this.disposed) return;
    if (state.flushTimer !== null) state.flushView?.clearTimeout(state.flushTimer);
    const view = participant.containerEl.ownerDocument.defaultView;
    state.flushView = view;
    if (!view) {
      void this.flushSource(state.sourcePath);
      return;
    }
    state.flushTimer = view.setTimeout(() => {
      state.flushTimer = null;
      state.flushView = null;
      void this.flushSource(state.sourcePath);
    }, ABSENCE_FLUSH_DELAY_MS);
  }

  recordMove(request: MoveRecordRequest): Promise<ImageSectionMoveOutcome> {
    if (this.disposed) return Promise.resolve({ status: "failed", error: new Error("Image section order session disposed") });
    const { source, target, sourceAfter, targetAfter, sameSection } = request;
    if (source.sourcePath !== target.sourcePath) return Promise.resolve({ status: "unsupported" });
    const state = this.stateFor(source.sourcePath);
    this.updateSection(state, source, sourceAfter);
    if (!sameSection) this.updateSection(state, target, targetAfter);
    state.version += 1;
    const version = state.version;
    const outcome = new Promise<ImageSectionMoveOutcome>((resolve) => state.waiters.push({ version, resolve }));
    this.schedulePersist(state);
    return outcome;
  }

  acceptCanonicalMutation(participant: ImageSectionOrderParticipant): void {
    const state = this.stateForExistingPath(participant.sourcePath);
    if (!state?.record) return;
    const id = this.participantSections.get(participant);
    const section = id ? state.record.sections.find((entry) => entry.id === id) ?? null : matchingSection(
      state.record,
      participant.canonicalPaths(),
      participant.locator().lineStart,
    );
    if (!section) return;
    this.removeSection(state, section.id);
    this.participantSections.delete(participant);
    state.durable = cloneRecord(state.record);
    if (state.durable) state.durable.sourcePath = state.sourcePath;
    state.persistedVersion = state.version;
    this.persistCanonicalCleanup(state);
  }

  async flushSource(sourcePath: string): Promise<void> {
    const state = this.stateForExistingPath(sourcePath);
    if (!state || state.flushingCanonical || state.participants.size > 0 || !state.record?.sections.length) return;
    await this.persistLatest(state);
    if (state.participants.size > 0 || !state.durable?.sections.length) return;
    state.flushingCanonical = true;
    try {
      const pending = state.durable.sections.map((section) => ({
        lineStart: section.lineStart,
        expectedPaths: [...section.expectedPaths],
        paths: [...section.paths],
      }));
      await this.committer.commitPendingSectionOrders(state.sourcePath, pending);
      await this.journal.remove(state.sourcePath);
      state.record = null;
      state.durable = null;
      state.version += 1;
      state.persistedVersion = state.version;
      this.cleanupRenamedJournals(state);
    } catch (error) {
      console.warn("AnimeList image order flush failed; pending order kept for retry", error);
    } finally {
      state.flushingCanonical = false;
    }
  }

  private createState(sourcePath: string, record: ImageSectionOrderJournalRecord | null): NoteState {
    return {
      sourcePath,
      record: cloneRecord(record),
      durable: cloneRecord(record),
      participants: new Set(),
      version: 0,
      persistedVersion: 0,
      writeScheduled: false,
      writing: false,
      waiters: [],
      flushTimer: null,
      flushView: null,
      flushingCanonical: false,
      sectionSerial: record?.sections.length ?? 0,
      renamedJournalPaths: new Set(),
      cleaningRenamedJournals: false,
    };
  }

  private resolveSourcePath(sourcePath: string): string {
    let current = sourcePath;
    const visited = new Set<string>();
    while (this.pathAliases.has(current) && !visited.has(current)) {
      visited.add(current);
      current = this.pathAliases.get(current) ?? current;
    }
    return current;
  }

  private stateForExistingPath(sourcePath: string): NoteState | undefined {
    return this.notes.get(this.resolveSourcePath(sourcePath));
  }

  private stateFor(sourcePath: string): NoteState {
    const resolvedPath = this.resolveSourcePath(sourcePath);
    let state = this.notes.get(resolvedPath);
    if (!state) {
      state = this.createState(resolvedPath, null);
      this.notes.set(resolvedPath, state);
    }
    return state;
  }

  private updateSection(
    state: NoteState,
    participant: ImageSectionOrderParticipant,
    desiredPaths: readonly string[],
  ): void {
    const canonicalPaths = [...participant.canonicalPaths()];
    let id = this.participantSections.get(participant);
    let section = id && state.record ? state.record.sections.find((entry) => entry.id === id) ?? null : null;
    if (!section) section = matchingSection(state.record, canonicalPaths, participant.locator().lineStart);
    if (!state.record) {
      state.record = { version: 1, sourcePath: state.sourcePath, sections: [], updatedAt: Date.now() };
    }
    if (!section) {
      state.sectionSerial += 1;
      id = `${participant.locator().lineStart ?? -1}:${state.sectionSerial}`;
      section = {
        id,
        lineStart: participant.locator().lineStart,
        expectedPaths: canonicalPaths,
        paths: [...desiredPaths],
      };
      state.record.sections.push(section);
    } else {
      section.lineStart = participant.locator().lineStart ?? section.lineStart;
      section.paths = [...desiredPaths];
      id = section.id;
    }
    this.participantSections.set(participant, id);
    if (samePaths(section.expectedPaths, section.paths)) {
      this.removeSection(state, section.id);
      this.participantSections.delete(participant);
    }
    if (state.record) {
      state.record.sourcePath = state.sourcePath;
      state.record.updatedAt = Date.now();
    }
  }

  private removeSection(state: NoteState, id: string): void {
    if (!state.record) return;
    state.record.sections = state.record.sections.filter((section) => section.id !== id);
    if (!state.record.sections.length) state.record = null;
  }

  private schedulePersist(state: NoteState): void {
    if (state.writeScheduled || state.writing) return;
    state.writeScheduled = true;
    queueMicrotask(() => {
      state.writeScheduled = false;
      void this.persistLatest(state);
    });
  }

  private async persistLatest(state: NoteState): Promise<void> {
    if (state.writing) return;
    if (state.persistedVersion >= state.version) {
      this.cleanupRenamedJournals(state);
      return;
    }
    state.writing = true;
    const snapshotVersion = state.version;
    const snapshot = cloneRecord(state.record);
    if (snapshot) snapshot.sourcePath = state.sourcePath;
    try {
      if (snapshot?.sections.length) await this.journal.write(snapshot);
      else await this.journal.remove(state.sourcePath);
      state.durable = cloneRecord(snapshot);
      state.persistedVersion = snapshotVersion;
      const completed = state.waiters.filter((waiter) => waiter.version <= snapshotVersion);
      state.waiters = state.waiters.filter((waiter) => waiter.version > snapshotVersion);
      for (const waiter of completed) waiter.resolve({ status: "moved" });
    } catch (error) {
      state.record = cloneRecord(state.durable);
      if (state.record) state.record.sourcePath = state.sourcePath;
      state.version = state.persistedVersion;
      this.rollbackParticipants(state);
      for (const waiter of state.waiters.splice(0)) waiter.resolve({ status: "failed", error });
    } finally {
      state.writing = false;
      if (state.persistedVersion < state.version) this.schedulePersist(state);
      else this.cleanupRenamedJournals(state);
    }
  }

  private rollbackParticipants(state: NoteState): void {
    for (const participant of state.participants) {
      if (!participant.ownsContainer()) continue;
      const canonical = [...participant.canonicalPaths()];
      const section = matchingSection(state.durable, canonical, participant.locator().lineStart);
      participant.applyPaths(section && !samePaths(section.paths, canonical) ? section.paths : canonical);
    }
  }

  private persistCanonicalCleanup(state: NoteState): void {
    const snapshot = cloneRecord(state.record);
    if (snapshot) snapshot.sourcePath = state.sourcePath;
    void (snapshot?.sections.length ? this.journal.write(snapshot) : this.journal.remove(state.sourcePath)).then(() => {
      this.cleanupRenamedJournals(state);
    }).catch((error) => {
      console.warn("AnimeList image order journal cleanup failed", error);
    });
  }

  private cleanupRenamedJournals(state: NoteState): void {
    if (state.cleaningRenamedJournals || state.writing || state.writeScheduled || state.persistedVersion < state.version) return;
    const paths = [...state.renamedJournalPaths].filter((path) => path !== state.sourcePath);
    if (!paths.length) return;
    state.cleaningRenamedJournals = true;
    void Promise.all(paths.map(async (path) => {
      try {
        await this.journal.remove(path);
        state.renamedJournalPaths.delete(path);
      } catch (error) {
        console.warn("AnimeList could not retire an old image order journal after note rename", error);
      }
    })).finally(() => {
      state.cleaningRenamedJournals = false;
    });
  }
}
