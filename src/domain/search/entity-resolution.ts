import type { ExternalMediaResult, ExternalMediaSourceRef } from "../media-types";

/**
 * Search identity is not title similarity. Only a shared, non-conflicting
 * provider ID can establish that two records describe the same media item.
 * Title/year/format remain ranking evidence, never identity evidence.
 */
export function mediaSourceRefs(result: ExternalMediaResult): ExternalMediaSourceRef[] {
  const all = [
    ...(result.provider && result.sourceId
      ? [{ provider: result.provider, sourceId: result.sourceId, sourceUrl: result.sourceUrl }]
      : []),
    ...(result.sources ?? []),
  ];
  const seen = new Set<string>();
  return all.filter(ref => {
    const provider = ref.provider.trim();
    const sourceId = ref.sourceId.trim();
    const key = JSON.stringify([provider, sourceId]);
    if (!provider || !sourceId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function identities(result: ExternalMediaResult): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  for (const ref of mediaSourceRefs(result)) {
    const ids = grouped.get(ref.provider) ?? new Set<string>();
    ids.add(ref.sourceId);
    grouped.set(ref.provider, ids);
  }
  return grouped;
}

export function sameMediaIdentity(left: ExternalMediaResult, right: ExternalMediaResult): boolean {
  if (left.mediaType !== right.mediaType) return false;
  const lhs = identities(left);
  const rhs = identities(right);
  let shared = false;
  for (const [provider, leftIds] of lhs) {
    const rightIds = rhs.get(provider);
    if (!rightIds) continue;
    // If either result attributes multiple different IDs to one provider,
    // the relationship is inconsistent and cannot be merged automatically.
    if (leftIds.size !== 1 || rightIds.size !== 1) return false;
    if (![...leftIds].some(id => rightIds.has(id))) return false;
    shared = true;
  }
  return shared;
}

function mergeSameIdentity(left: ExternalMediaResult, right: ExternalMediaResult): ExternalMediaResult {
  const titles = [
    ...(left.searchTitles ?? []), ...(right.searchTitles ?? []),
    left.title, right.title, left.originalTitle, right.originalTitle,
    left.romajiTitle, right.romajiTitle,
  ].map(value => value.trim()).filter(Boolean);
  const classification = left.classification ?? right.classification;
  return {
    ...left,
    sources: mediaSourceRefs({
      ...left,
      sources: [...mediaSourceRefs(left), ...mediaSourceRefs(right)],
    }),
    searchTitles: [...new Set(titles)],
    originalTitle: left.originalTitle || right.originalTitle,
    romajiTitle: left.romajiTitle || right.romajiTitle,
    coverUrl: left.coverUrl || right.coverUrl,
    summary: left.summary || right.summary,
    ...(classification ? {
      classification,
      genres: classification.genres.length ? classification.genres : left.genres,
      people: left.mediaType === "anime" && classification.studios.length
        ? classification.studios : left.people,
    } : {}),
  };
}

export function deduplicateMediaIdentities(results: readonly ExternalMediaResult[]): ExternalMediaResult[] {
  const output: ExternalMediaResult[] = [];
  for (const value of results) {
    const result = { ...value, sources: mediaSourceRefs(value) };
    const matches: number[] = [];
    for (let index = 0; index < output.length; index += 1) {
      if (sameMediaIdentity(output[index], result)) matches.push(index);
    }
    // A record bridging multiple distinct identities is ambiguous. Do not
    // join their clusters transitively or silently erase the uncertainty.
    if (matches.length !== 1) {
      output.push(result);
    } else {
      output[matches[0]] = mergeSameIdentity(output[matches[0]], result);
    }
  }
  return output;
}
