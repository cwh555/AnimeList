import type { RankingEvidence } from "./ranking-evidence";
import { provesBefore } from "./ranking-evidence";
import { answerRound, nextRoundPair, type RankingRound, type RoundChoice } from "./ranking-rounds";

export function provenRankingChoice(
  evidence: RankingEvidence | undefined,
  candidate: string,
  reference: string,
): Exclude<RoundChoice, "skip"> | null {
  if (!evidence) return null;
  const better = provesBefore(evidence, candidate, reference);
  const worse = provesBefore(evidence, reference, candidate);
  if (better && worse) throw new Error("Contradictory saved ranking evidence; review the affected works.");
  return better ? "better" : worse ? "worse" : null;
}

export interface RankingInsertionAttempt {
  path: string;
  comparisons: Readonly<Record<string, RoundChoice>>;
}

export function provenRankingBounds(
  ordered: readonly string[],
  attempt: RankingInsertionAttempt,
  evidence: RankingEvidence | undefined,
): { first: number; last: number } {
  let first = 0;
  let last = ordered.length;
  for (const [index, reference] of ordered.entries()) {
    const saved = attempt.comparisons[reference];
    const proven = provenRankingChoice(evidence, attempt.path, reference);
    if (saved && saved !== "skip" && proven && saved !== proven) {
      throw new Error("Contradictory saved ranking answers; review the affected works.");
    }
    const choice = saved && saved !== "skip" ? saved : proven;
    if (choice === "better") last = Math.min(last, index);
    if (choice === "worse") first = Math.max(first, index + 1);
  }
  if (first > last) throw new Error("Conflicting ranking comparisons. Recompare this item.");
  return { first, last };
}

/** Apply only answers already proved by previous strict comparisons.
 * Inferred questions are not counted as manual answers and add no edges.
 */
export function resolveProvenRoundPairs(
  round: RankingRound,
  evidence: RankingEvidence | undefined,
): string[] | null {
  let pair = nextRoundPair(round);
  while (pair) {
    const forced = provenRankingChoice(evidence, pair.candidate, pair.reference);
    if (!forced) break;
    const result = answerRound(round, forced, false);
    if (result.done) return result.done;
    pair = nextRoundPair(round);
  }
  return null;
}
