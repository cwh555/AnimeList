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

/**
 * A work has an exact position only if strict reachability determines its
 * relationship to every other eligible work. Knowing just the relative order
 * within a previously ranked subset is not sufficient when other works are
 * pending. This projection does not modify the persisted ranking.
 */
export function certifiedAbsoluteRankingPositions(
  ordered: readonly string[],
  eligible: readonly string[],
  savedEvidence: RankingEvidence | undefined,
  attempts: readonly RankingComparisonEvidence[] = [],
): AbsoluteRankingPosition[] {
  const allowed = new Set(eligible);
  const proof: RankingEvidence = {};
  const source = savedEvidence ?? legacyRankingEvidence(ordered);
  for (const [from, targets] of Object.entries(source)) {
    if (!allowed.has(from)) continue;
    proof[from] = targets.filter(path => allowed.has(path));
  }

  // Old v1 pending attempts contain actual votes but no central proof graph.
  // Only import consistent answers; conflicts must not create a definite rank.
  const conflicting = new Set<string>();
  for (const attempt of attempts) {
    if (!allowed.has(attempt.path)) continue;
    for (const [reference, answer] of Object.entries(attempt.comparisons)) {
      if (answer === "skip" || !allowed.has(reference)) continue;
      const better = answer === "better" ? attempt.path : reference;
      const worse = answer === "better" ? reference : attempt.path;
      try {
        recordRankingEvidence(proof, better, worse);
      } catch {
        conflicting.add(attempt.path);
        conflicting.add(reference);
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
    reachable.set(root, seen);
  }
  const complete: AbsoluteRankingPosition[] = [];
  for (const path of ordered) {
    if (!allowed.has(path) || conflicting.has(path)) continue;
    let before = 0;
    let valid = true;
    for (const other of allowed) {
      if (other === path) continue;
      if (conflicting.has(other)) { valid = false; break; }
      const precedes = reachable.get(path)?.has(other) ?? false;
      const follows = reachable.get(other)?.has(path) ?? false;
      if (precedes === follows) { valid = false; break; }
      if (follows) before += 1;
    }
    if (valid) complete.push({ path, position: before + 1 });
  }
  return complete.sort((a, b) => a.position - b.position);
}
