import { requestUrl } from "obsidian";
import { USER_AGENT } from "../app-metadata";
import type { ProviderSettings } from "../domain/settings-types";
import type { ExternalMediaResult, MediaType } from "../domain/media-types";
import { asArray, stringValue } from "../domain/value-normalization";
import { rankSearchResults, searchQueryVariants } from "../search";
import { searchFeatureText } from "../search-feature-text";
import {
  dedupeSearchResults,
  normalizeAniListMedia,
  normalizeBangumiSubject,
  normalizeOpenLibraryBook,
} from "./provider-normalizers";


function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : stringValue(value, "Unknown error");
}

export interface MetadataProviderClient {
  searchBangumi(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  searchOpenLibrary(query: string): Promise<ExternalMediaResult[]>;
}

export class HttpMetadataProviderClient implements MetadataProviderClient {
  async searchBangumi(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]> {
    const response = await requestUrl({
      url: "https://api.bgm.tv/v0/search/subjects?limit=20&offset=0",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        keyword: query,
        sort: "match",
        filter: { type: [mediaType === "anime" ? 2 : 1], nsfw: false },
      }),
    });
    const payload = record(response.json ?? JSON.parse(response.text || "{}"));
    return asArray(payload.data).map((subject) => normalizeBangumiSubject(subject, mediaType));
  }

  async searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]> {
    const graphQuery = `
      query ($search: String, $type: MediaType, $format: MediaFormat) {
        Page(page: 1, perPage: 20) {
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
    const variables = {
      search: query,
      type: mediaType === "anime" ? "ANIME" : "MANGA",
      format: mediaType === "novel" ? "NOVEL" : null,
    };
    const response = await requestUrl({
      url: "https://graphql.anilist.co",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ query: graphQuery, variables }),
    });
    const payload = record(response.json ?? JSON.parse(response.text || "{}"));
    const data = record(payload.data);
    const page = record(data.Page);
    let media = asArray(page.media);
    if (mediaType === "manga") {
      media = media.filter((item) => stringValue(record(item).format).toUpperCase() !== "NOVEL");
    }
    return media.map((item) => normalizeAniListMedia(item, mediaType));
  }

  async searchOpenLibrary(query: string): Promise<ExternalMediaResult[]> {
    const fields = "key,title,author_name,first_publish_year,cover_i,subject";
    const response = await requestUrl({
      url: `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&limit=8&lang=zh`,
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    const payload = record(response.json ?? JSON.parse(response.text || "{}"));
    return asArray(payload.docs).map(normalizeOpenLibraryBook);
  }
}

interface ProviderTaskResult {
  provider: string;
  items?: ExternalMediaResult[];
  error?: unknown;
}

export class ExternalMediaSearchService {
  constructor(
    private readonly providers: () => ProviderSettings,
    private readonly client: MetadataProviderClient,
  ) {}

  async search(mediaType: MediaType, query: string): Promise<{
    results: ExternalMediaResult[];
    warnings: string[];
  }> {
    const settings = this.providers();
    const queries = searchQueryVariants(query);
    const tasks: Array<Promise<ProviderTaskResult>> = [];
    const runProvider = (
      provider: string,
      search: (candidate: string) => Promise<ExternalMediaResult[]>,
    ): Promise<ProviderTaskResult> => Promise.all(queries.map(search))
      .then((groups) => ({ provider, items: dedupeSearchResults(groups.flat()) }))
      .catch((error: unknown) => ({ provider, error }));

    if (settings.bangumi) {
      tasks.push(runProvider("Bangumi", (candidate) => this.client.searchBangumi(mediaType, candidate)));
    }
    if (settings.anilist) {
      tasks.push(runProvider("AniList", (candidate) => this.client.searchAniList(mediaType, candidate)));
    }
    if (mediaType === "novel" && settings.openlibrary) {
      tasks.push(runProvider("Open Library", (candidate) => this.client.searchOpenLibrary(candidate)));
    }
    if (!tasks.length) {
      return { results: [], warnings: [searchFeatureText("provider.noneEnabled")] };
    }

    const settled = await Promise.all(tasks);
    const warnings = settled
      .filter((entry) => entry.error !== undefined)
      .map((entry) => `${entry.provider}: ${errorMessage(entry.error)}`);
    const results = dedupeSearchResults(settled.flatMap((entry) => entry.items ?? []));
    return { results: rankSearchResults(results, query).slice(0, 24), warnings };
  }
}
