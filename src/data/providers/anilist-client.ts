import { requestUrl } from "obsidian";
import { USER_AGENT } from "../../app-metadata";
import type { MediaType } from "../../domain/media-types";
import { asArray, stringValue } from "../../domain/value-normalization";
import type { MetadataProviderClient, MetadataProviderPage } from "../external-media-provider";
import { normalizeAniListMedia } from "../provider-normalizers";

export const ANILIST_GRAPHQL_ENDPOINT = "https://graphql.anilist.co";
export const ANILIST_SEARCH_PAGE_SIZE = 20;

export const ANILIST_MEDIA_SEARCH_QUERY = `
  query ($search: String, $type: MediaType, $format: MediaFormat, $page: Int) {
    Page(page: $page, perPage: ${ANILIST_SEARCH_PAGE_SIZE}) {
      pageInfo { hasNextPage }
      media(search: $search, type: $type, format: $format, sort: SEARCH_MATCH) {
        id siteUrl type format status episodes chapters volumes averageScore description(asHtml: false) genres synonyms
        startDate { year month day }
        title { romaji english native }
        coverImage { extraLarge large medium }
        studios(isMain: true) { nodes { name } }
        staff(perPage: 10, sort: RELEVANCE) { edges { role node { name { full native } } } }
      }
    }
  }`;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export class AniListClient implements MetadataProviderClient {
  readonly id = "anilist" as const;
  readonly label = "AniList";

  supports(_mediaType: MediaType): boolean { return true; }

  private async graphQl(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await requestUrl({
      url: ANILIST_GRAPHQL_ENDPOINT,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ query, variables }),
    });
    const parsed: unknown = response.json ?? JSON.parse(response.text || "{}");
    return record(parsed);
  }

  async searchPage(mediaType: MediaType, query: string, page: number): Promise<MetadataProviderPage> {
    const normalizedPage = Math.max(1, Math.floor(page));
    const payload = await this.graphQl(ANILIST_MEDIA_SEARCH_QUERY, {
      search: query,
      type: mediaType === "anime" ? "ANIME" : "MANGA",
      format: mediaType === "novel" ? "NOVEL" : null,
      page: normalizedPage,
    });
    const pagePayload = record(record(payload.data).Page);
    let media = asArray(pagePayload.media);
    if (mediaType === "manga") {
      media = media.filter((item) => stringValue(record(item).format).toUpperCase() !== "NOVEL");
    }
    return {
      results: media.map((item) => normalizeAniListMedia(item, mediaType)),
      hasMore: record(pagePayload.pageInfo).hasNextPage === true,
    };
  }
}
