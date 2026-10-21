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
  if (!Array.isArray(round.results) || !round.results.every(paths)) corrupted("results");
  if (!Array.isArray(round.jobs)) corrupted("jobs");
  for (const item of round.jobs as unknown[]) {
    if (!object(item) || !paths(item.left) || !paths(item.right)
      || !paths(item.winners) || typeof item.done !== "boolean") corrupted("jobs.item");
  }
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
    return { round: value as RankingRound, recovered: false, needsRecompare: false, pendingPaths: [] };
  } catch {
    // Continue to a reconstructive recovery, not a generic "invalid data" error.
  }
  if (object(value) && (round.results === null || round.results === undefined)
    && Array.isArray(round.jobs) && round.jobs.every((job) =>
      object(job) && paths(job.left) && paths(job.right)
      && paths(job.winners) && typeof job.done === "boolean")) {
    const restored: RawRecord = { ...value,
      results: round.jobs.map((job: RawRecord) => job.done ? [...(job.winners as string[])] : []),
    };
    try {
      assertStoredRankingRound(restored, type);
      return {
        round: restored as unknown as RankingRound,
        recovered: true, needsRecompare: false, pendingPaths: [],
      };
    } catch {
      // A different field is damaged too; isolate this round below.
    }
  }

  const participants = new Set<string>();
  const add = (input: unknown): void => {
    if (paths(input)) for (const path of input) participants.add(path);
  };
  if (object(value)) {
    add(round.baseline);
    if (Array.isArray(round.results)) for (const result of round.results) add(result);
    if (Array.isArray(round.jobs)) {
      for (const job of round.jobs) {
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
