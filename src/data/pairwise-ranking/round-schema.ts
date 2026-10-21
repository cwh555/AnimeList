/** Validate untrusted persisted round state before any ranking traversal. */
export function assertStoredRankingRound(value: unknown, type: string): void {
  if (value == null) return; // v1 before rounds, or no round active
  const corrupted = (field: string): never => {
    throw new Error("Invalid saved ranking round (" + type + "." + field
      + "). Original ranking file has not been changed.");
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) corrupted("round");
  const round = value as Record<string, unknown>;
  const isPaths = (input: unknown): input is string[] =>
    Array.isArray(input) && input.every((path) => typeof path === "string");
  if (round.kind !== "full" && round.kind !== "append" && round.kind !== "range") corrupted("kind");
  for (const name of ["stage", "total", "comparisons", "cursor", "rangeStart", "rangeLength"]) {
    if (typeof round[name] !== "number" || !Number.isSafeInteger(round[name])
      || round[name] < 0) corrupted(name);
  }
  if (!isPaths(round.baseline)) corrupted("baseline");
  if (!Array.isArray(round.results) || !round.results.every(isPaths)) corrupted("results");
  if (!Array.isArray(round.jobs)) corrupted("jobs");
  for (const item of round.jobs) {
    if (!item || typeof item !== "object" || Array.isArray(item)) corrupted("jobs.item");
    const job = item as Record<string, unknown>;
    if (!isPaths(job.left) || !isPaths(job.right) || !isPaths(job.winners)
      || typeof job.done !== "boolean") corrupted("jobs.item");
  }
}
