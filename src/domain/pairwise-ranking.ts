import type { MediaItem, MediaType } from "./media-types";
import {
  startRankingRound, nextRoundPair, answerRound, mapRankingRound, advanceRound,
  type RankingRound,
} from "./ranking-rounds";
export { roundProgress } from "./ranking-rounds";
import { diverseRankingOrder, rankingSeriesKey } from "./ranking-scheduler";
import {
  type RankingEvidence, recordRankingEvidence, provesBefore, legacyRankingEvidence,
  certifyRankingOrder, declareManualPosition, renameRankingEvidencePath, removeRankingEvidencePaths,
} from "./ranking-evidence";

export type RankingChoice = "better" | "worse" | "skip";
export type RankingMode = "new" | "pending" | "reset";

export interface RankingAttempt {
  path: string;
  // Decisions belong to the candidate, relative to an already-ranked reference.
  comparisons: Record<string, RankingChoice>;
}

export interface RankingCollection {
  ordered: string[];
  /** Strict user-answer graph; absent only in legacy v1 ranking files. */
  evidence?: RankingEvidence;
  /** Persisted round-robin generation ensures distinct early pairings on rerank. */
  roundGeneration?: number;
  pending: Record<string, RankingAttempt>;
  active: RankingAttempt | null;
  round?: RankingRound | null;
  /** Remaining paths in this user-initiated pending-review session.
   * An empty array with active set means the last work is still in progress.
   */
  pendingQueue?: string[] | null;
}

export interface RankingState {
  version: 1;
  anime: RankingCollection;
  manga: RankingCollection;
  novel: RankingCollection;
}

export interface RankingPair {
  candidate: string;
  reference: string;
}

export interface RankingBounds {
  first: number;
  last: number;
}

export function emptyRankingCollection(): RankingCollection {
  return { ordered: [], roundGeneration: 0, pending: {}, active: null, round: null, pendingQueue: null };
}

export function emptyRankingState(): RankingState {
  return {
    version: 1,
    anime: emptyRankingCollection(),
    manga: emptyRankingCollection(),
    novel: emptyRankingCollection(),
  };
}

export function completedRankingItems(items: readonly MediaItem[], type: MediaType): MediaItem[] {
  return items
    .filter((item) => item.mediaType === type && item.status === "completed")
    .sort((a, b) => a.title.localeCompare(b.title, "zh-Hant", { numeric: true }) || a.filePath.localeCompare(b.filePath));
}

export function rankingBounds(list: RankingCollection, attempt: RankingAttempt): RankingBounds {
  let first = 0;
  let last = list.ordered.length;
  for (const [path, decision] of Object.entries(attempt.comparisons)) {
    const index = list.ordered.indexOf(path);
    if (index < 0) continue;
    if (decision === "better") last = Math.min(last, index);
    if (decision === "worse") first = Math.max(first, index + 1);
  }
  if (first > last) throw new Error("Conflicting ranking comparisons. Recompare this item.");
  return { first, last };
}

export function nextRankingPair(list: RankingCollection): RankingPair | null {
  if (list.round) return nextRoundPair(list.round);
  if (!list.active) return null;
  const { first, last } = rankingBounds(list, list.active);
  if (first === last) return null;
  const midpoint = (first + last - 1) / 2;
  let selected = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = first; index < last; index += 1) {
    const reference = list.ordered[index];
    if (Object.hasOwn(list.active.comparisons, reference)) continue;
    const distance = Math.abs(index - midpoint);
    if (distance < bestDistance) {
      selected = index;
      bestDistance = distance;
    }
  }
  return selected < 0 ? null : { candidate: list.active.path, reference: list.ordered[selected] };
}

function settleActive(list: RankingCollection): void {
  if (!list.active) return;
  const { first, last } = rankingBounds(list, list.active);
  if (first === last) {
    list.evidence ??= legacyRankingEvidence(list.ordered);
    // Saved individual answers are first-class evidence, including when the
    // attempt was restored from a previously skipped pending review.
    for (const [other, choice] of Object.entries(list.active.comparisons)) {
      if (choice === "skip") continue;
      recordRankingEvidence(list.evidence,
        choice === "better" ? list.active.path : other,
        choice === "better" ? other : list.active.path);
    }
    const before = list.ordered[first - 1];
    const after = list.ordered[first];
    if ((before && !provesBefore(list.evidence, before, list.active.path))
      || (after && !provesBefore(list.evidence, list.active.path, after))) {
      // Do not claim a definite position unless both adjacent relations follow
      // from saved answers (or the legacy user-confirmed order).
      list.pending[list.active.path] = list.active;
      list.active = null;
      return;
    }
    list.ordered.splice(first, 0, list.active.path);
    delete list.pending[list.active.path];
    list.active = null;
  } else if (!nextRankingPair(list)) {
    list.pending[list.active.path] = list.active;
    list.active = null;
  }
}

/** Continue a saved, single-pass review of the pending entries.
 * Skipped entries are deliberately not enqueued again in this session.
 */
function advancePendingQueue(list: RankingCollection): void {
  if (!list.pendingQueue || list.active) return;
  while (!list.active && list.pendingQueue.length) {
    const path = list.pendingQueue.shift();
    if (!path) continue;
    const attempt = list.pending[path];
    if (!attempt) continue; // May have been transitively settled since enqueue.
    list.active = { path, comparisons: Object.fromEntries(
      Object.entries(attempt.comparisons).filter(([, choice]) => choice !== "skip"),
    ) };
    delete list.pending[path];
    settleActive(list);
  }
  if (!list.active && !list.pendingQueue.length) list.pendingQueue = null;
}

export function reconcileRanking(list: RankingCollection, eligible: readonly MediaItem[]): void {
  const allowed = new Set(eligible.map((item) => item.filePath));
  // Existing ranks represent comparisons already committed by the user.
  // Only legacy files lack a stored proof graph; preserve their established
  // order, without inventing relationships to unknown or pending entries.
  if (!list.evidence) list.evidence = legacyRankingEvidence(list.ordered);
  if (list.round) {
    mapRankingRound(list.round, (path) => allowed.has(path) ? path : null);
    const finished = advanceRound(list.round);
    if (finished) finishRankingRound(list, finished);
  }
  list.ordered = [...new Set(list.ordered.filter((path) => allowed.has(path)))];
  const ranked = new Set(list.ordered);
  if (list.pendingQueue) {
    list.pendingQueue = [...new Set(list.pendingQueue.filter((path) => allowed.has(path) && !ranked.has(path)))];
    if (!list.pendingQueue.length && !list.active) list.pendingQueue = null;
  }
  const clean = (attempt: RankingAttempt): RankingAttempt => ({
    path: attempt.path,
    comparisons: Object.fromEntries(Object.entries(attempt.comparisons).filter(
      ([path]) => ranked.has(path) && path !== attempt.path,
    )),
  });
  list.pending = Object.fromEntries(Object.entries(list.pending)
    .filter(([path]) => allowed.has(path) && !ranked.has(path))
    .map(([path, attempt]) => [path, clean(attempt)]));
  if (list.active && (!allowed.has(list.active.path) || ranked.has(list.active.path))) list.active = null;
  if (list.active) {
    list.active = clean(list.active);
    delete list.pending[list.active.path];
  }
}

/** Resolve only entries with exactly one consistent insertion slot, never infer a tie. */
export function settleUnambiguousPending(list: RankingCollection): number {
  let resolved = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [path, attempt] of Object.entries(list.pending)) {
      const { first, last } = rankingBounds(list, attempt);
      if (first !== last) continue;
      list.evidence ??= legacyRankingEvidence(list.ordered);
      for (const [other, choice] of Object.entries(attempt.comparisons)) {
        if (choice === "skip") continue;
        recordRankingEvidence(list.evidence,
          choice === "better" ? path : other, choice === "better" ? other : path);
      }
      const before = list.ordered[first - 1], after = list.ordered[first];
      if ((before && !provesBefore(list.evidence, before, path))
        || (after && !provesBefore(list.evidence, path, after))) continue;
      list.ordered.splice(first, 0, path);
      delete list.pending[path];
      resolved += 1;
      changed = true;
      break;
    }
  }
  return resolved;
}

function pickNext(list: RankingCollection, eligible: readonly MediaItem[]): void {
  if (list.active) return;
  const seen = new Set([...list.ordered, ...Object.keys(list.pending)]);
  const next = eligible.find((item) => !seen.has(item.filePath));
  if (next) list.active = { path: next.filePath, comparisons: {} };
}

function finishRankingRound(list: RankingCollection, sequence: string[]): void {
  const round = list.round;
  if (!round) return;
  if (round.kind === "range") {
    list.ordered = [
      ...round.baseline.slice(0, round.rangeStart),
      ...sequence,
      ...round.baseline.slice(round.rangeStart + round.rangeLength),
    ];
  } else {
    list.ordered = sequence;
  }
  list.round = null;
  const certified = certifyRankingOrder(list.ordered, list.evidence ?? {});
  list.ordered = certified.ordered;
  for (const path of certified.pending) {
    list.pending[path] ??= { path, comparisons: {} };
  }
  for (const path of list.ordered) delete list.pending[path];
  settleUnambiguousPending(list);
}

/**
 * Round queues keep independent merge jobs in flight to avoid one work appearing
 * repeatedly. Existing stable ranks remain visible until a successful commit.
 */
export function prepareRankingRounds(
  list: RankingCollection,
  eligible: readonly MediaItem[],
  kind: RankingRound["kind"],
  first = 1, last = list.ordered.length,
): boolean {
  if (list.round) return Boolean(nextRoundPair(list.round));
  reconcileRanking(list, eligible);
  const existing = new Set([...list.ordered, ...Object.keys(list.pending)]);
  if (list.active) existing.add(list.active.path);
  const newPaths = eligible.map((item) => item.filePath).filter((path) => !existing.has(path));
  let participants: string[];
  if (kind === "range") {
    if (first < 1 || last > list.ordered.length || last - first < 1) return false;
    participants = list.ordered.slice(first - 1, last);
  } else if (kind === "full") {
    participants = eligible.map((item) => item.filePath);
    list.ordered = [];
    list.pending = {};
    list.active = null;
    list.pendingQueue = null;
  } else {
    if (!newPaths.length) return false;
    participants = newPaths;
    if (list.active) {
      participants.unshift(list.active.path);
      list.active = null;
    }
  }
  const baseline = kind === "full" ? [] : [...list.ordered];
  if (kind === "range") {
    list.evidence ??= legacyRankingEvidence(list.ordered);
    const left = baseline[first - 2], right = baseline[last];
    const preserved = participants.map(path => ({
      path, leftProven: Boolean(left && provesBefore(list.evidence, left, path)),
      rightProven: Boolean(right && provesBefore(list.evidence, path, right)),
    }));
    removeRankingEvidencePaths(list.evidence, new Set(participants));
    for (const entry of preserved) {
      if (left && entry.leftProven) recordRankingEvidence(list.evidence, left, entry.path);
      if (right && entry.rightProven) recordRankingEvidence(list.evidence, entry.path, right);
    }
  }
  const generation = list.roundGeneration ?? 0;
  // An append/range operation must not consume a full-rerank matching: two
  // successive full resets should vary even if incremental inserts intervened.
  if (kind === "full") {
    list.roundGeneration = generation + 1;
    list.evidence = {};
  }
  const participantSet = new Set(participants);
  const scheduled = diverseRankingOrder(eligible.filter(item => participantSet.has(item.filePath)), generation);
  // Preserve baseline as one sorted run for incremental merge.
  list.round = startRankingRound(scheduled, kind, baseline, first - 1, participants.length,
    Object.fromEntries(eligible.map(item => [item.filePath, rankingSeriesKey(item)])));
  const finished = advanceRound(list.round);
  if (finished) finishRankingRound(list, finished);
  return Boolean(nextRankingPair(list)) || participants.length > 0;
}

export function prepareRanking(list: RankingCollection, eligible: readonly MediaItem[], mode: RankingMode): void {
  reconcileRanking(list, eligible);
  if (mode === "reset") {
    list.ordered = [];
    list.pending = {};
    list.active = null;
    list.pendingQueue = null;
    list.evidence = {};
  }
  if (mode === "pending") {
    // Snapshot the entire batch once. A skipped item may remain pending, but
    // cannot be requeued until the user explicitly begins a new review.
    if (list.pendingQueue == null) {
      list.pendingQueue = eligible.map((item) => item.filePath)
        .filter((path) => Object.hasOwn(list.pending, path));
    }
    advancePendingQueue(list);
    return;
  }
  pickNext(list, eligible);
  settleActive(list);
  // Seed entries that need no question (e.g., the first item), then ask the next one.
  for (let i = 0; i < eligible.length && !list.active; i += 1) {
    const previous = list.ordered.length;
    pickNext(list, eligible);
    settleActive(list);
    if (list.ordered.length === previous) break;
  }
}

export function resumePendingRanking(
  list: RankingCollection, eligible: readonly MediaItem[], path: string,
): boolean {
  const pending = list.pending[path];
  if (!pending) return false;
  if (list.active) list.pending[list.active.path] = list.active;
  list.active = { path, comparisons: Object.fromEntries(Object.entries(pending.comparisons)
    .filter(([, choice]) => choice !== "skip")) };
  delete list.pending[path];
  settleActive(list);
  if (!list.active) {
    if (list.pendingQueue != null) advancePendingQueue(list);
    else {
      pickNext(list, eligible);
      settleActive(list);
    }
  }
  return true;
}

export function decideRanking(
  list: RankingCollection,
  eligible: readonly MediaItem[],
  choice: RankingChoice,
): boolean {
  const pair = nextRankingPair(list);
  if (!pair) return false;
  if (list.round) {
    const result = answerRound(list.round, choice);
    if (result.better && result.worse) {
      list.evidence ??= {};
      recordRankingEvidence(list.evidence, result.better, result.worse);
    }
    if (result.skipped) {
      list.pending[result.skipped] = {
        path: result.skipped,
        comparisons: result.against ? { [result.against]: "skip" } : {},
      };
    }
    if (result.done) finishRankingRound(list, result.done);
    return true;
  }
  if (!list.active) return false;
  list.active.comparisons[pair.reference] = choice;
  if (choice !== "skip") {
    list.evidence ??= {};
    recordRankingEvidence(list.evidence,
      choice === "better" ? pair.candidate : pair.reference,
      choice === "better" ? pair.reference : pair.candidate);
  }
  settleActive(list);
  settleUnambiguousPending(list);
  if (!list.active) {
    if (list.pendingQueue != null) advancePendingQueue(list);
    else {
      pickNext(list, eligible);
      settleActive(list);
    }
  }
  return true;
}

/** The dragged row is removed before choosing its destination; do not count it. */
export function rankingDropPosition(
  rowBounds: readonly { top: number; height: number }[],
  draggedIndex: number,
  pointerY: number,
): number {
  let target = 1;
  rowBounds.forEach((rect, index) => {
    if (index !== draggedIndex && pointerY >= rect.top + rect.height / 2) target += 1;
  });
  return Math.max(1, Math.min(rowBounds.length, target));
}

/** Destination for a wrapped card grid, after logically removing the dragged item. */
export function rankingGridDropPosition(
  bounds: readonly { left: number; top: number; width: number; height: number }[],
  sourceIndex: number, pointerX: number, pointerY: number,
): number {
  if (!bounds.length) return 1;
  let nearest = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < bounds.length; index++) {
    const rect = bounds[index];
    const dx = Math.max(rect.left - pointerX, 0, pointerX - rect.left - rect.width);
    const dy = Math.max(rect.top - pointerY, 0, pointerY - rect.top - rect.height);
    const score = dx * dx + dy * dy;
    if (score < distance) { distance = score; nearest = index; }
  }
  const rect = bounds[nearest];
  const isGrid = bounds.length >= 2 && Math.abs(bounds[0].top - bounds[1].top) < 8;
  const after = isGrid ? pointerX >= rect.left + rect.width / 2
    : pointerY >= rect.top + rect.height / 2;
  const slot = nearest + (after ? 1 : 0);
  return Math.max(1, Math.min(bounds.length, slot - (sourceIndex < slot ? 1 : 0) + 1));
}

export function moveRankedItem(list: RankingCollection, path: string, position: number): boolean {
  const oldIndex = list.ordered.indexOf(path);
  const newIndex = Math.max(0, Math.min(list.ordered.length - 1, Math.trunc(position) - 1));
  if (oldIndex < 0 || !Number.isFinite(position) || oldIndex === newIndex) return false;
  // Explicit manual movement takes priority over an unfinished automatic round.
  list.round = null;
  list.ordered.splice(oldIndex, 1);
  list.ordered.splice(newIndex, 0, path);
  list.evidence ??= legacyRankingEvidence(list.ordered.filter(item => item !== path));
  declareManualPosition(list.evidence, list.ordered, path);
  // Every unaffected ranked pair keeps its relative order. Only comparisons to
  // the moved work can contradict the latest explicit manual order.
  for (const candidate of Object.values(list.pending)) delete candidate.comparisons[path];
  if (list.active) delete list.active.comparisons[path];
  settleUnambiguousPending(list);
  return true;
}

export function placePendingItem(list: RankingCollection, path: string, position: number): boolean {
  if (!Object.hasOwn(list.pending, path) || !Number.isInteger(position)
    || position < 1 || position > list.ordered.length + 1) return false;
  list.round = null;
  list.ordered.splice(position - 1, 0, path);
  list.evidence ??= legacyRankingEvidence(list.ordered.filter(item => item !== path));
  declareManualPosition(list.evidence, list.ordered, path);
  delete list.pending[path];
  for (const candidate of Object.values(list.pending)) delete candidate.comparisons[path];
  if (list.active) delete list.active.comparisons[path];
  return true;
}

export function recompareRankedItem(list: RankingCollection, path: string): boolean {
  const index = list.ordered.indexOf(path);
  if (index < 0) return false;
  if (list.evidence && index > 0 && index < list.ordered.length - 1) {
    const before = list.ordered[index - 1], after = list.ordered[index + 1];
    if (provesBefore(list.evidence, before, after)) recordRankingEvidence(list.evidence, before, after);
  }
  list.ordered.splice(index, 1);
  if (list.evidence) {
    // Old path relationships no longer apply while it is being re-compared.
    delete list.evidence[path];
    for (const targets of Object.values(list.evidence)) {
      const offset = targets.indexOf(path);
      if (offset >= 0) targets.splice(offset, 1);
    }
  }
  list.pending[path] = { path, comparisons: {} };
  if (list.active?.path === path) list.active = null;
  for (const attempt of Object.values(list.pending)) delete attempt.comparisons[path];
  if (list.active) delete list.active.comparisons[path];
  return true;
}

export function removeRankingPath(state: RankingState, path: string): boolean {
  let changed = false;
  for (const type of ["anime", "manga", "novel"] as const) {
    const list = state[type];
    let changedHere = false;
    if (list.pendingQueue) {
      const oldLength = list.pendingQueue.length;
      list.pendingQueue = list.pendingQueue.filter((item) => item !== path);
      if (oldLength !== list.pendingQueue.length) changedHere = true;
    }
    if (list.round) {
      const oldRound = JSON.stringify(list.round);
      mapRankingRound(list.round, (item) => item === path ? null : item);
      if (oldRound !== JSON.stringify(list.round)) {
        changedHere = true;
        const done = advanceRound(list.round);
        if (done) finishRankingRound(list, done);
      }
    }
    const previous = list.ordered.length;
    if (list.evidence && list.ordered.includes(path)) {
      const oldIndex = list.ordered.indexOf(path);
      const before = list.ordered[oldIndex - 1];
      const after = list.ordered[oldIndex + 1];
      if (before && after && provesBefore(list.evidence, before, after)) {
        recordRankingEvidence(list.evidence, before, after);
      }
    }
    list.ordered = list.ordered.filter((item) => item !== path);
    if (list.evidence) {
      delete list.evidence[path];
      for (const targets of Object.values(list.evidence)) {
        const index = targets.indexOf(path);
        if (index >= 0) targets.splice(index, 1);
      }
    }
    if (previous !== list.ordered.length) changedHere = true;
    if (Object.hasOwn(list.pending, path)) {
      delete list.pending[path];
      changedHere = true;
    }
    if (list.active?.path === path) { list.active = null; changedHere = true; }
    for (const attempt of Object.values(list.pending)) {
      if (Object.hasOwn(attempt.comparisons, path)) {
        delete attempt.comparisons[path];
        changedHere = true;
      }
    }
    if (list.active && Object.hasOwn(list.active.comparisons, path)) {
      delete list.active.comparisons[path];
      changedHere = true;
    }
    if (changedHere) {
      changed = true;
    }
  }
  return changed;
}

export function renameRankingPath(state: RankingState, from: string, to: string): boolean {
  if (!from || !to || from === to) return false;
  let changed = false;
  for (const type of ["anime", "manga", "novel"] as const) {
    const list = state[type];
    if (list.pendingQueue) {
      const mapped = [...new Set(list.pendingQueue.map((item) => item === from ? to : item))];
      if (JSON.stringify(mapped) !== JSON.stringify(list.pendingQueue)) {
        list.pendingQueue = mapped;

        changed = true;
      }
    }
    if (list.round) {
      const oldRound = JSON.stringify(list.round);
      mapRankingRound(list.round, (item) => item === from ? to : item);
      if (oldRound !== JSON.stringify(list.round)) { changed = true;  }
    }
    if (list.evidence) renameRankingEvidencePath(list.evidence, from, to);
    const replace = (value: string): string => value === from ? to : value;
    if (list.ordered.includes(from)) {
      list.ordered = [...new Set(list.ordered.map(replace))];
      changed = true;

    }
    const relabel = (attempt: RankingAttempt): void => {
      if (attempt.path === from) { attempt.path = to; changed = true;  }
      if (Object.hasOwn(attempt.comparisons, from)) {
        attempt.comparisons[to] = attempt.comparisons[from];
        delete attempt.comparisons[from];
        changed = true;

      }
    };
    if (list.pending[from]) {
      if (!list.pending[to]) list.pending[to] = list.pending[from];
      delete list.pending[from];
      changed = true;

    }
    Object.values(list.pending).forEach(relabel);
    if (list.active) relabel(list.active);
  }
  return changed;
}

/** Complete, disjoint view partition: all eligible work is either proven
 * against the ranked chain or explicitly visible as unresolved.
 */
export function rankingUnresolvedPaths(list: RankingCollection, eligible: readonly MediaItem[]): string[] {
  const ranked = new Set(list.ordered);
  return [...new Set(eligible.map(item => item.filePath).filter(path => !ranked.has(path)))];
}

export function rankingCounts(list: RankingCollection, eligible: readonly MediaItem[]): {
  ranked: number; pending: number; unranked: number;
} {
  return { ranked: list.ordered.length, pending: rankingUnresolvedPaths(list, eligible).length, unranked: 0 };
}
