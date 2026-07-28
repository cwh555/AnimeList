import { requestUrl } from "obsidian";
import { USER_AGENT } from "../app-metadata";
import type { ProviderSettings, SearchLanguageSettings } from "../domain/settings-types";
import type { ExternalMediaResult, MediaType } from "../domain/media-types";
import { asArray, stringValue } from "../domain/value-normalization";
import { searchMultilingualProviders, type SearchProviderAdapter } from "../multilingual-search";
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

export class ExternalMediaSearchService {
  constructor(
    private readonly providers: () => ProviderSettings,
    private readonly client: MetadataProviderClient,
    private readonly languages: () => SearchLanguageSettings = () => ({
      chinese: true,
      english: true,
      original: true,
    }),
  ) {}

  async search(mediaType: MediaType, query: string): Promise<{
    results: ExternalMediaResult[];
    warnings: string[];
  }> {
    const settings = this.providers();
    const providers: SearchProviderAdapter[] = [];
    if (settings.bangumi) {
      providers.push({
        label: "Bangumi",
        supportsChineseDiscovery: true,
        search: (candidate) => this.client.searchBangumi(mediaType, candidate),
      });
    }
    if (settings.anilist) {
      providers.push({
        label: "AniList",
        search: (candidate) => this.client.searchAniList(mediaType, candidate),
      });
    }
    if (mediaType === "novel" && settings.openlibrary) {
      providers.push({
        label: "Open Library",
        search: (candidate) => this.client.searchOpenLibrary(candidate),
      });
    }
    if (!providers.length) {
      return { results: [], warnings: [searchFeatureText("provider.noneEnabled")] };
    }

    const response = await searchMultilingualProviders({
      query,
      providers,
      languages: this.languages(),
      dedupe: dedupeSearchResults,
      maxResults: 24,
    });
    return { results: response.results, warnings: response.warnings };
  }
}
