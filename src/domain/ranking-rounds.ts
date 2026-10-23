/**
 * Bottom-up, round-robin merge ranking.
 *
 * Jobs within a round are interleaved. A winner is emitted to the merged run;
 * the loser remains at its queue head. This is not single elimination: every
 * surviving entry receives an exact relative position once the last merge ends.
 * An undecidable pair removes one non-baseline entry to the pending pool rather
 * than inventing a comparison or final rank.
 *
 * This module is independent of Obsidian and of the legacy binary insertion.
 */
export type RoundChoice = "better" | "worse" | "skip";
export interface MergeJob {
  left: string[];
  right: string[];
  winners: string[];
  done: boolean;
}
export interface RankingRound {
  kind: "full" | "append" | "range";
  stage: number;
  total: number;
  comparisons: number;
  cursor: number;
  jobs: MergeJob[];
  results: string[][];
  baseline: string[];
  rangeStart: number;
  rangeLength: number;
  /** Optional for old saved rounds. Only affects scheduling, not rank decisions. */
  seriesKeys?: Record<string, string>;
}
export interface RoundPair { candidate: string; reference: string }

function job(left: string[], right: string[]): MergeJob {
  return { left: [...left], right: [...right], winners: [], done: false };
}
function makeJobs(runs: string[][]): MergeJob[] {
  const jobs: MergeJob[] = [];
  for (let index = 0; index < runs.length; index += 2) {
    jobs.push(job(runs[index], runs[index + 1] ?? []));
  }
  return jobs;
}
export function startRankingRound(
  paths: readonly string[], kind: RankingRound["kind"],
  baseline: readonly string[] = [], rangeStart = 0, rangeLength = 0,
  seriesKeys: Record<string, string> = {},
): RankingRound {
  const unique = [...new Set(paths)];
  const orderedRuns = kind === "append" && baseline.length
    ? [[...baseline], ...unique.filter((path) => !baseline.includes(path)).map((path) => [path])]
    : unique.map((path) => [path]);
  const jobs = makeJobs(orderedRuns);
  const round: RankingRound = {
    kind, stage: 1, total: unique.length, comparisons: 0,
    cursor: 0, jobs,
    // A sparse array serializes its holes as null. Always keep one dense
    // result slot per merge job, even when only a later job has completed.
    results: jobs.map((): string[] => []), baseline: [...baseline], rangeStart, rangeLength,
    seriesKeys,
  };
  advanceRound(round);
  return round;
}

/** Drains trivially complete jobs and starts the next merge stage. */
export function advanceRound(round: RankingRound): string[] | null {
  for (;;) {
    for (let index = 0; index < round.jobs.length; index++) {
      const current = round.jobs[index];
      if (current.done || (current.left.length && current.right.length)) continue;
      current.winners.push(...current.left, ...current.right);
      current.left = [];
      current.right = [];
      current.done = true;
      round.results[index] = current.winners;
    }
    if (round.jobs.some((entry) => !entry.done)) return null;
    const runs = round.results.filter((run) => run.length);
    if (runs.length <= 1) return runs[0] ?? [];
    round.stage += 1;
    round.jobs = makeJobs(runs);
    round.results = round.jobs.map((): string[] => []);
    round.cursor = 0;
  }
}
function nextJobIndex(round: RankingRound): number {
  if (!round.jobs.length) return -1;
  let fallback = -1;
  for (let offset = 0; offset < round.jobs.length; offset += 1) {
    const index = (round.cursor + offset) % round.jobs.length;
    const current = round.jobs[index];
    if (current.done || !current.left.length || !current.right.length) continue;
    if (fallback < 0) fallback = index;
    const leftSeries = round.seriesKeys?.[current.left[0]];
    const rightSeries = round.seriesKeys?.[current.right[0]];
    // Only defer pairs when their confidently normalized franchise keys match.
    if (!leftSeries || !rightSeries || leftSeries !== rightSeries) return index;
  }
  return fallback;
}
export function nextRoundPair(round: RankingRound): RoundPair | null {
  const index = nextJobIndex(round);
  if (index < 0) return null;
  const current = round.jobs[index];
  return { candidate: current.left[0], reference: current.right[0] };
}
export function answerRound(
  round: RankingRound, choice: RoundChoice,
): { done: string[] | null; skipped: string | null; against: string | null; better: string | null; worse: string | null } {
  const selectedIndex = nextJobIndex(round);
  if (selectedIndex < 0) return { done: advanceRound(round), skipped: null, against: null, better: null, worse: null };
  const current = round.jobs[selectedIndex];
  let skipped: string | null = null;
  let against: string | null = null;
  const before = current.left[0];
  const after = current.right[0];
  if (choice === "better") current.winners.push(current.left.shift());
  else if (choice === "worse") current.winners.push(current.right.shift());
  else {
    const baseline = new Set(round.kind === "append" ? round.baseline : []);
    // Skipping a comparison must never evict an already-ranked baseline entry.
    const removeLeft = !baseline.has(current.left[0]);
    skipped = removeLeft ? current.left.shift() : current.right.shift();
    against = removeLeft ? current.right[0] : current.left[0];
  }
  round.comparisons += 1;
  round.cursor = (selectedIndex + 1) % round.jobs.length;
  return { done: advanceRound(round), skipped, against,
    better: choice === "better" ? before : choice === "worse" ? after : null,
    worse: choice === "better" ? after : choice === "worse" ? before : null };
}
export function roundProgress(round: RankingRound): { stage: number; position: number; total: number } {
  const unfinished = round.jobs.filter((entry) => !entry.done);
  const active = round.jobs.findIndex((entry) => !entry.done && entry.left.length && entry.right.length);
  return { stage: round.stage, position: Math.max(1, active + 1), total: unfinished.length + round.jobs.filter((job) => job.done).length };
}

/** Keep path renames, deletions and status changes non-destructive to other runs. */
export function mapRankingRound(round: RankingRound, mapper: (path: string) => string | null): void {
  const remap = (paths: string[]): string[] => [...new Set(paths.map(mapper).filter((path): path is string => path !== null))];
  round.baseline = remap(round.baseline);
  if (round.seriesKeys) {
    const keys: Record<string, string> = {};
    for (const [path, key] of Object.entries(round.seriesKeys)) {
      const renamed = mapper(path);
      if (renamed != null) keys[renamed] = key;
    }
    round.seriesKeys = keys;
  }
  for (const current of round.jobs) {
    current.left = remap(current.left);
    current.right = remap(current.right);
    current.winners = remap(current.winners);
  }
  round.results = round.results.map(remap);
}
