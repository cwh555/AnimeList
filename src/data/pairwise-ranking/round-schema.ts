import type { RankingRound } from "../../domain/ranking-rounds";

type RawRecord = Record<string, unknown>;
function object(value: unknown): value is RawRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function paths(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Validate all fields traversed by the round algorithm before they are accessed. */
export function assertStoredRankingRound(value: unknown, type: string): asserts value is RankingRound | null | undefined {
  if (value == null) return; // old v1 files did not contain a round
  const corrupted = (field: string): never => {
    throw new Error("Invalid saved ranking round (" + type + "." + field + ").");
  };
  const round: RawRecord = object(value) ? value : corrupted("round");
  if (round.kind !== "full" && round.kind !== "append" && round.kind !== "range") corrupted("kind");
  for (const name of ["stage", "total", "comparisons", "cursor", "rangeStart", "rangeLength"]) {
    if (typeof round[name] !== "number" || !Number.isSafeInteger(round[name]) || round[name] < 0) corrupted(name);
  }
  if (!paths(round.baseline)) corrupted("baseline");
  if (round.seriesKeys !== undefined
    && (!object(round.seriesKeys)
      || Object.entries(round.seriesKeys).some(([key, value]) => !key || typeof value !== "string"))) {
    corrupted("seriesKeys");
  }
  const jobs: unknown[] = Array.isArray(round.jobs) ? round.jobs : corrupted("jobs");
  for (const item of jobs) {
    if (!object(item) || !paths(item.left) || !paths(item.right)
      || !paths(item.winners) || typeof item.done !== "boolean") corrupted("jobs.item");
  }
  // A previously saved sparse results array becomes [null, ...] in JSON.
  // Array.prototype.every() skips holes, so use an indexed check as well.
  const results: unknown[] = Array.isArray(round.results) ? round.results : corrupted("results");
  if (results.length !== jobs.length
    || !jobs.every((job, index) => {
      const entry = results[index];
      if (!paths(entry)) return false;
      const item = job as { done: boolean; winners: string[] };
      return item.done
        ? entry.length === item.winners.length && entry.every((path, i) => path === item.winners[i])
        : entry.length === 0;
    })) corrupted("results");
}

export interface RecoveredRound {
  round: RankingRound | null;
  recovered: boolean;
  /** True if an incomplete round could not be reconstructed exactly. */
  needsRecompare: boolean;
  /** Previously seen paths that must not disappear from the collection. */
  pendingPaths: string[];
}

/**
 * The results array is redundant: finished merge jobs also retain their winners.
 * Recover from a null results field without losing the comparison queue.
 * For unrecoverable structural damage, quarantine only that category's round and
 * retain identifiable participants as undecided, never assigning invented ranks.
 */
export function recoverStoredRankingRound(value: unknown, type: string): RecoveredRound {
  if (value == null) return { round: null, recovered: false, needsRecompare: false, pendingPaths: [] };
  try {
    assertStoredRankingRound(value, type);
    return { round: value, recovered: false, needsRecompare: false, pendingPaths: [] };
  } catch {
    // Continue to a reconstructive recovery, not a generic "invalid data" error.
  }
  // Results are derived entirely from each job's done/winners state. This
  // handles null whole arrays, null entries from JSON-saved sparse arrays,
  // missing slots, and older partially-populated results without dropping
  // any comparison evidence. Other invalid fields are NOT guessed.
  if (object(value) && Array.isArray(value.jobs)
    && value.jobs.every((job) =>
      object(job) && paths(job.left) && paths(job.right)
      && paths(job.winners) && typeof job.done === "boolean")) {
    const restored: RawRecord = {
      ...value,
      results: value.jobs.map((job: { done: boolean; winners: string[] }) =>
        job.done ? [...job.winners] : []),
    };
    try {
      assertStoredRankingRound(restored, type);
      return {
        round: restored,
        recovered: true, needsRecompare: false, pendingPaths: [],
      };
    } catch {
      // Another structural field is damaged. Quarantine just this round below.
    }
  }

  const participants = new Set<string>();
  const add = (input: unknown): void => {
    if (paths(input)) for (const path of input) participants.add(path);
  };
  if (object(value)) {
    add(value.baseline);
    if (Array.isArray(value.results)) for (const result of value.results) add(result);
    if (Array.isArray(value.jobs)) {
      for (const job of value.jobs) {
        if (!object(job)) continue;
        add(job.left);
        add(job.right);
        add(job.winners);
      }
    }
  }
  return {
    round: null, recovered: true, needsRecompare: true,
    pendingPaths: [...participants],
  };
}
