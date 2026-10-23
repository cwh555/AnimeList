/** Strict preference certificates. Edges are answers or explicit manual order,
 * and reachability is the only permitted transitive inference.
 */
export type RankingEvidence = Record<string, string[]>;

export function provesBefore(evidence: RankingEvidence, better: string, worse: string): boolean {
  if (better === worse) return false;
  const seen = new Set<string>([better]);
  const queue = [better];
  for (let head = 0; head < queue.length; head += 1) {
    for (const next of evidence[queue[head]] ?? []) {
      if (next === worse) return true;
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return false;
}

export function recordRankingEvidence(evidence: RankingEvidence, better: string, worse: string): void {
  if (!better || !worse || better === worse || provesBefore(evidence, worse, better)) {
    throw new Error("Conflicting strict ranking evidence; recompare the affected works.");
  }
  // Keep explicit (or deliberately materialized transitive) edges even when
  // another path currently proves the same relation. Removing/recomparing an
  // intermediate work must not erase evidence between unaffected works.
  const targets = evidence[better] ?? [];
  if (!targets.includes(worse)) evidence[better] = [...targets, worse];
}

/** Older files stored the user's already-established total order, but not
 * individual votes. Preserve that user-confirmed order as an explicit legacy
 * certificate; do not infer any relation involving pending or unseen works.
 */
export function legacyRankingEvidence(ordered: readonly string[]): RankingEvidence {
  const proof: RankingEvidence = {};
  for (let index = 1; index < ordered.length; index += 1) {
    recordRankingEvidence(proof, ordered[index - 1], ordered[index]);
  }
  return proof;
}

/** Keep only a provable chain. Unprovable candidates must remain pending. */
export function certifyRankingOrder(sequence: readonly string[], evidence: RankingEvidence): {
  ordered: string[]; pending: string[];
} {
  const ordered: string[] = [];
  const pending: string[] = [];
  for (const path of [...new Set(sequence)]) {
    if (!ordered.length || provesBefore(evidence, ordered[ordered.length - 1], path)) {
      ordered.push(path);
    } else {
      pending.push(path);
    }
  }
  return { ordered, pending };
}

export function removeRankingEvidencePaths(evidence: RankingEvidence, paths: ReadonlySet<string>): void {
  for (const path of Object.keys(evidence)) {
    if (paths.has(path)) { delete evidence[path]; continue; }
    evidence[path] = evidence[path].filter(target => !paths.has(target));
  }
}

export function renameRankingEvidencePath(evidence: RankingEvidence, from: string, to: string): void {
  if (evidence[from]) {
    evidence[to] = [...new Set([...(evidence[to] ?? []), ...evidence[from]])].filter(path => path !== to);
    delete evidence[from];
  }
  for (const path of Object.keys(evidence)) {
    evidence[path] = [...new Set(evidence[path].map(target => target === from ? to : target))]
      .filter(target => target !== path);
  }
}

/** A manual reposition is itself an explicit user assertion of the entire
 * requested order for this item, not an algorithmically guessed comparison.
 */
export function declareManualPosition(evidence: RankingEvidence, ordered: readonly string[], path: string): void {
  removeRankingEvidencePaths(evidence, new Set([path]));
  const index = ordered.indexOf(path);
  if (index < 0) return;
  ordered.forEach((other, position) => {
    if (other === path) return;
    if (position < index) recordRankingEvidence(evidence, other, path);
    else recordRankingEvidence(evidence, path, other);
  });
}
