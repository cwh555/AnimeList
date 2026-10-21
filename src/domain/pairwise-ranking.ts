import type { MediaItem, MediaType } from "./media-types";

export type RankingChoice = "better" | "worse" | "skip";
export type RankingMode = "new" | "pending" | "reset";

export interface RankingAttempt {
  path: string;
  // Decisions belong to the candidate, relative to an already-ranked reference.
  comparisons: Record<string, RankingChoice>;
}

export interface RankingSnapshot {
  ordered: string[];
  pending: Record<string, RankingAttempt>;
  active: RankingAttempt | null;
}

export interface RankingCollection extends RankingSnapshot {
  history: RankingSnapshot[];
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
  return { ordered: [], pending: {}, active: null, history: [] };
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

export function rankingSnapshot(list: RankingCollection): RankingSnapshot {
  return {
    ordered: [...list.ordered],
    pending: Object.fromEntries(Object.entries(list.pending).map(([key, value]) =>
      [key, { path: value.path, comparisons: { ...value.comparisons } }])),
    active: list.active ? { path: list.active.path, comparisons: { ...list.active.comparisons } } : null,
  };
}

function checkpoint(list: RankingCollection): void {
  list.history.push(rankingSnapshot(list));
  if (list.history.length > 30) list.history.shift();
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
    list.ordered.splice(first, 0, list.active.path);
    delete list.pending[list.active.path];
    list.active = null;
  } else if (!nextRankingPair(list)) {
    list.pending[list.active.path] = list.active;
    list.active = null;
  }
}

export function reconcileRanking(list: RankingCollection, eligible: readonly MediaItem[]): void {
  const allowed = new Set(eligible.map((item) => item.filePath));
  const before = JSON.stringify({ ordered: list.ordered, pending: list.pending, active: list.active });
  list.ordered = [...new Set(list.ordered.filter((path) => allowed.has(path)))];
  const ranked = new Set(list.ordered);
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
  // Only invalidate undo if membership or reference evidence actually changed.
  if (before !== JSON.stringify({ ordered: list.ordered, pending: list.pending, active: list.active })) list.history = [];
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
      list.ordered.splice(first, 0, path);
      delete list.pending[path];
      resolved += 1;
      changed = true;
      break;
    }
  }
  return resolved;
}

function pickNext(list: RankingCollection, eligible: readonly MediaItem[], mode: "new" | "pending"): void {
  if (list.active) return;
  if (mode === "pending") {
    const next = eligible.map((item) => item.filePath).find((path) => Object.hasOwn(list.pending, path));
    if (!next) return;
    list.active = { path: next, comparisons: Object.fromEntries(Object.entries(list.pending[next].comparisons)
      .filter(([, choice]) => choice !== "skip")) };
    delete list.pending[next];
    return;
  }
  const seen = new Set([...list.ordered, ...Object.keys(list.pending)]);
  const next = eligible.find((item) => !seen.has(item.filePath));
  if (next) list.active = { path: next.filePath, comparisons: {} };
}

export function prepareRanking(list: RankingCollection, eligible: readonly MediaItem[], mode: RankingMode): void {
  reconcileRanking(list, eligible);
  if (mode === "reset") {
    list.ordered = [];
    list.pending = {};
    list.active = null;
    list.history = [];
  }
  pickNext(list, eligible, mode === "pending" ? "pending" : "new");
  settleActive(list);
  // Seed entries that need no question (e.g., the first item), then ask the next one.
  for (let i = 0; i < eligible.length && !list.active; i += 1) {
    const previous = list.ordered.length;
    pickNext(list, eligible, "new");
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
    pickNext(list, eligible, "new");
    settleActive(list);
  }
  return true;
}

export function decideRanking(
  list: RankingCollection,
  eligible: readonly MediaItem[],
  choice: RankingChoice,
): boolean {
  const pair = nextRankingPair(list);
  if (!pair || !list.active) return false;
  checkpoint(list);
  list.active.comparisons[pair.reference] = choice;
  settleActive(list);
  settleUnambiguousPending(list);
  if (!list.active) {
    pickNext(list, eligible, "new");
    settleActive(list);
  }
  return true;
}

export function undoRanking(list: RankingCollection): boolean {
  const previous = list.history.pop();
  if (!previous) return false;
  list.ordered = previous.ordered;
  list.pending = previous.pending;
  list.active = previous.active;
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

export function moveRankedItem(list: RankingCollection, path: string, position: number): boolean {
  const oldIndex = list.ordered.indexOf(path);
  const newIndex = Math.max(0, Math.min(list.ordered.length - 1, Math.trunc(position) - 1));
  if (oldIndex < 0 || !Number.isFinite(position) || oldIndex === newIndex) return false;
  checkpoint(list);
  list.ordered.splice(oldIndex, 1);
  list.ordered.splice(newIndex, 0, path);
  // Every unaffected ranked pair keeps its relative order. Only comparisons to
  // the moved work can contradict the latest explicit manual order.
  for (const candidate of Object.values(list.pending)) delete candidate.comparisons[path];
  if (list.active) delete list.active.comparisons[path];
  settleUnambiguousPending(list);
  list.history = [];
  return true;
}

export function placePendingItem(list: RankingCollection, path: string, position: number): boolean {
  if (!Object.hasOwn(list.pending, path) || !Number.isInteger(position)
    || position < 1 || position > list.ordered.length + 1) return false;
  list.ordered.splice(position - 1, 0, path);
  delete list.pending[path];
  for (const candidate of Object.values(list.pending)) delete candidate.comparisons[path];
  if (list.active) delete list.active.comparisons[path];
  list.history = [];
  return true;
}

export function recompareRankedItem(list: RankingCollection, path: string): boolean {
  const index = list.ordered.indexOf(path);
  if (index < 0) return false;
  list.ordered.splice(index, 1);
  list.pending[path] = { path, comparisons: {} };
  if (list.active?.path === path) list.active = null;
  for (const attempt of Object.values(list.pending)) delete attempt.comparisons[path];
  if (list.active) delete list.active.comparisons[path];
  list.history = [];
  return true;
}

export function removeRankingPath(state: RankingState, path: string): boolean {
  let changed = false;
  for (const type of ["anime", "manga", "novel"] as const) {
    const list = state[type];
    const previous = list.ordered.length;
    list.ordered = list.ordered.filter((item) => item !== path);
    if (previous !== list.ordered.length) changed = true;
    if (Object.hasOwn(list.pending, path)) {
      delete list.pending[path];
      changed = true;
    }
    if (list.active?.path === path) { list.active = null; changed = true; }
    for (const attempt of Object.values(list.pending)) {
      if (Object.hasOwn(attempt.comparisons, path)) {
        delete attempt.comparisons[path];
        changed = true;
      }
    }
    if (list.active && Object.hasOwn(list.active.comparisons, path)) {
      delete list.active.comparisons[path];
      changed = true;
    }
    if (changed) list.history = [];
  }
  return changed;
}

export function renameRankingPath(state: RankingState, from: string, to: string): boolean {
  if (!from || !to || from === to) return false;
  let changed = false;
  for (const type of ["anime", "manga", "novel"] as const) {
    const list = state[type];
    let changedHere = false;
    const replace = (value: string): string => value === from ? to : value;
    if (list.ordered.includes(from)) {
      list.ordered = [...new Set(list.ordered.map(replace))];
      changed = true;
      changedHere = true;
    }
    const relabel = (attempt: RankingAttempt): void => {
      if (attempt.path === from) { attempt.path = to; changed = true; changedHere = true; }
      if (Object.hasOwn(attempt.comparisons, from)) {
        attempt.comparisons[to] = attempt.comparisons[from];
        delete attempt.comparisons[from];
        changed = true;
        changedHere = true;
      }
    };
    if (list.pending[from]) {
      if (!list.pending[to]) list.pending[to] = list.pending[from];
      delete list.pending[from];
      changed = true;
      changedHere = true;
    }
    Object.values(list.pending).forEach(relabel);
    if (list.active) relabel(list.active);
    if (changedHere) list.history = [];
  }
  return changed;
}

export function rankingCounts(list: RankingCollection, eligible: readonly MediaItem[]): {
  ranked: number; pending: number; unranked: number;
} {
  const excluded = new Set([...list.ordered, ...Object.keys(list.pending)]);
  if (list.active) excluded.add(list.active.path);
  return {
    ranked: list.ordered.length,
    pending: Object.keys(list.pending).length,
    unranked: eligible.filter((item) => !excluded.has(item.filePath)).length + (list.active ? 1 : 0),
  };
}
