import type { ExternalMediaResult, ExternalMediaSourceRef } from "../domain/media-types";
import { mediaSourceRefs } from "../domain/search/entity-resolution";
import { AniListClient } from "./providers/anilist-client";

function mergeClassification(source: ExternalMediaResult, anilist: ExternalMediaResult): ExternalMediaResult {
  if (!anilist.classification || source.mediaType !== anilist.mediaType) return source;
  const classification = anilist.classification;
  const refs = [...mediaSourceRefs(source), ...mediaSourceRefs(anilist)];
  const seen = new Set<string>();
  const sources: ExternalMediaSourceRef[] = refs.filter(ref => {
    const key = JSON.stringify([ref.provider, ref.sourceId]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    ...source,
    genres: classification.genres.length ? classification.genres : source.genres,
    people: source.mediaType === "anime" && classification.studios.length
      ? classification.studios : source.people,
    sources,
    classification,
  };
}

/**
 * Classification may only attach a second provider's identity when a verified
 * AniList ID already exists. A matching translated title/year is a search
 * candidate, not proof that the two database records refer to the same work.
 */
export class MediaClassificationService {
  constructor(private readonly anilist: AniListClient) {}

  private anilistSourceId(result: ExternalMediaResult): string {
    if (result.provider === "anilist") return result.sourceId;
    return mediaSourceRefs(result).find(ref => ref.provider === "anilist")?.sourceId ?? "";
  }

  async enrich(result: ExternalMediaResult): Promise<ExternalMediaResult> {
    if (result.classification?.anilistId) return mergeClassification(result, result);
    const id = this.anilistSourceId(result);
    if (!id) return result;
    const direct = await this.anilist.fetchMediaById(result.mediaType, id);
    if (!direct || direct.sourceId !== id) return result;
    return mergeClassification(result, direct);
  }

  async enrichOrOriginal(
    result: ExternalMediaResult,
    onError?: (error: unknown) => void,
  ): Promise<ExternalMediaResult> {
    try {
      return await this.enrich(result);
    } catch (error) {
      onError?.(error);
      return result;
    }
  }
}
