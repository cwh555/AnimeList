import type { RankingEvidence } from "./ranking-evidence";
import { legacyRankingEvidence, recordRankingEvidence } from "./ranking-evidence";

/** A saved answer is evidence, but never a guessed result of a skipped pair. */
export interface RankingComparisonEvidence {
  path: string;
  comparisons: Readonly<Record<string, "better" | "worse" | "skip">>;
}

export interface AbsoluteRankingPosition {
  path: string;
  /** One-based position among *all* eligible completed works. */
  position: number;
}

/** Exact possible absolute-rank interval under every total order consistent
 * with the user's decisions. Endpoints are inclusive and one-based. */
export interface PossibleRankingPosition {
  path: string;
  first: number;
  last: number;
}

export interface RankingPositionProjection {
  confirmed: AbsoluteRankingPosition[];
  possible: PossibleRankingPosition[];
}

/**
 * Construct the same strict preference graph used to certify confirmed ranks
 * and bound pending ranks. For a DAG, the earliest possible position is one
 * plus its forced predecessors, and the latest is N minus its forced
 * successors. Both endpoints are attainable by a topological ordering.
 *
 * Skip is never evidence; an invalid or contradictory graph cannot justify
 * narrowing any rank. This read-only projection never mutates stored ranking.
 */
export function projectRankingPositions(
  ordered: readonly string[],
  eligible: readonly string[],
  savedEvidence: RankingEvidence | undefined,
  attempts: readonly RankingComparisonEvidence[] = [],
): RankingPositionProjection {
  const allowed = new Set(eligible);
  const proof: RankingEvidence = {};
  const source = savedEvidence ?? legacyRankingEvidence(ordered);
  for (const [from, targets] of Object.entries(source)) {
    if (!allowed.has(from)) continue;
    proof[from] = targets.filter(path => allowed.has(path));
  }

  let invalid = false;
  for (const attempt of attempts) {
    if (!allowed.has(attempt.path)) continue;
    for (const [reference, answer] of Object.entries(attempt.comparisons)) {
      if (answer === "skip" || !allowed.has(reference)) continue;
      const better = answer === "better" ? attempt.path : reference;
      const worse = answer === "better" ? reference : attempt.path;
      try {
        recordRankingEvidence(proof, better, worse);
      } catch {
        invalid = true;
      }
    }
  }

  const reachable = new Map<string, Set<string>>();
  for (const root of allowed) {
    const seen = new Set<string>();
    const queue = [...(proof[root] ?? [])];
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...(proof[current] ?? []));
    }
    if (seen.has(root)) invalid = true; // A cycle has no consistent strict order.
    reachable.set(root, seen);
  }

  const possible: PossibleRankingPosition[] = [];
  const confirmed: AbsoluteRankingPosition[] = [];
  const orderedSet = new Set(ordered);
  for (const path of allowed) {
    let before = 0;
    let after = 0;
    if (!invalid) {
      for (const other of allowed) {
        if (path === other) continue;
        if (reachable.get(other)?.has(path)) before += 1;
        if (reachable.get(path)?.has(other)) after += 1;
      }
    }
    const first = invalid ? 1 : before + 1;
    const last = invalid ? allowed.size : allowed.size - after;
    possible.push({ path, first, last });
    if (!invalid && first === last && orderedSet.has(path)) {
      confirmed.push({ path, position: first });
    }
  }
  confirmed.sort((a, b) => a.position - b.position);
  return { confirmed, possible };
}

/** Compatibility wrapper for existing callers using only certain ranks. */
export function certifiedAbsoluteRankingPositions(
  ordered: readonly string[],
  eligible: readonly string[],
  savedEvidence: RankingEvidence | undefined,
  attempts: readonly RankingComparisonEvidence[] = [],
): AbsoluteRankingPosition[] {
  return projectRankingPositions(ordered, eligible, savedEvidence, attempts).confirmed;
}
