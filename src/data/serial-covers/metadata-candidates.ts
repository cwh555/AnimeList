import type { ExternalMediaSearchPage } from "../../domain/media-types";
import type { RankedSerialCoverCandidate, SerialCoverCandidate } from "../../domain/serial-covers/ranking";

export type SerialCoverMediaType = "manga" | "novel";

/**
 * Uses the exact same configured metadata clients as the Add Media search.
 * The caller supplies the existing searchExternalPage host adapter; no new
 * provider HTTP implementation or independent provider settings are needed.
 */
export type SerialCoverMetadataSearch = (
  mediaType: SerialCoverMediaType,
  query: string,
  page: number,
) => Promise<ExternalMediaSearchPage>;

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  bangumi: "Bangumi",
  anilist: "AniList",
  openlibrary: "Open Library",
};

export async function searchMetadataCoverCandidates(
  search: SerialCoverMetadataSearch,
  mediaType: SerialCoverMediaType,
  query: string,
): Promise<SerialCoverCandidate[]> {
  const page = await search(mediaType, query, 1);
  const seen = new Set<string>();
  const candidates: SerialCoverCandidate[] = [];
  for (const result of page.results) {
    if (result.mediaType !== mediaType || !result.coverUrl) continue;
    const provider = result.provider.trim();
    const id = result.sourceId.trim();
    const key = JSON.stringify([provider.toLowerCase(), id || result.coverUrl]);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      provider: PROVIDER_LABELS[provider.toLowerCase()] ?? provider,
      sourceId: id,
      // Keep the provider's original volume number, which can be lost in
      // localized titles, when determining the cover's actual identity.
      title: result.originalTitle || result.title,
      coverUrl: result.coverUrl,
      infoUrl: result.sourceUrl,
      categories: [...result.platforms, ...result.genres],
      authors: result.people,
      mediaTypeHint: mediaType,
    });
  }
  return candidates;
}

/** Separate provider identities can have distinct edition artwork. */
export function uniqueSerialCoverSources<T extends SerialCoverCandidate>(candidates: readonly T[]): T[] {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = JSON.stringify([
      candidate.provider.toLowerCase(),
      candidate.sourceId || candidate.coverUrl,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** An automatically loaded cover must identify the specific volume. */
export function hasExactVolumeCover(
  candidates: readonly RankedSerialCoverCandidate[],
): boolean {
  return candidates.length > 0;
}
