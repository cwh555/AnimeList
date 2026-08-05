import { requestUrl } from "obsidian";
import { USER_AGENT } from "../../app-metadata";
import type { ExternalMediaResult, MediaType } from "../../domain/media-types";
import { asArray, stringValue } from "../../domain/value-normalization";
import type { MetadataProviderClient, MetadataProviderPage } from "../external-media-provider";
import { normalizeAniListMedia } from "../provider-normalizers";

export const ANILIST_GRAPHQL_ENDPOINT = "https://graphql.anilist.co";
export const ANILIST_SEARCH_PAGE_SIZE = 20;
export const ANILIST_REQUEST_TIMEOUT_MS = 5_000;
export const ANILIST_CACHE_TTL_MS = 60_000;
export const ANILIST_MAX_CACHE_ENTRIES = 32;
export const ANILIST_MAX_INTERACTIVE_RETRY_DELAY_MS = 2_500;

const ANILIST_MEDIA_FIELDS = `
  id siteUrl type format status episodes chapters volumes averageScore description(asHtml: false) genres synonyms
  startDate { year month day }
  title { romaji english native }
  coverImage { extraLarge large medium }
  season seasonYear source countryOfOrigin
  tags { name category rank isGeneralSpoiler isMediaSpoiler isAdult }
  studios(isMain: true) { nodes { name } }
  staff(perPage: 10, sort: RELEVANCE) { edges { role node { name { full native } } } }
`;

export const ANILIST_MEDIA_SEARCH_QUERY = `
  query ($search: String, $type: MediaType, $format: MediaFormat, $page: Int) {
    Page(page: $page, perPage: ${ANILIST_SEARCH_PAGE_SIZE}) {
      pageInfo { hasNextPage }
      media(search: $search, type: $type, format: $format, sort: SEARCH_MATCH) {
        ${ANILIST_MEDIA_FIELDS}
      }
    }
  }`;

export const ANILIST_MEDIA_METADATA_QUERY = `
  query ($id: Int!, $type: MediaType) {
    Media(id: $id, type: $type) {
      ${ANILIST_MEDIA_FIELDS}
    }
  }`;

export interface AniListClientOptions {
  requestTimeoutMs?: number;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  maxInteractiveRetryDelayMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface CachedPayload {
  expiresAt: number;
  payload: Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function errorStatus(error: unknown): number | null {
  const candidate = record(error);
  for (const value of [candidate.status, candidate.statusCode, record(candidate.response).status]) {
    const status = Number(value);
    if (Number.isInteger(status) && status > 0) return status;
  }
  const match = error instanceof Error ? error.message.match(/\b(403|429|5\d\d)\b/) : null;
  return match ? Number(match[1]) : null;
}

function headerValue(headers: unknown, name: string): string {
  const values = record(headers);
  const entry = Object.entries(values).find(([key]) => key.toLocaleLowerCase() === name.toLocaleLowerCase());
  return entry ? stringValue(entry[1]).trim() : "";
}

function retryAfterMilliseconds(error: unknown): number | null {
  const value = headerValue(record(record(error).response).headers, "retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function graphQlError(payload: Record<string, unknown>): Error | null {
  const first = record(asArray(payload.errors)[0]);
  if (!Object.keys(first).length) return null;
  const error = new Error(stringValue(first.message, "AniList GraphQL request failed")) as Error & { status?: number };
  const status = Number(first.status);
  if (Number.isInteger(status) && status > 0) error.status = status;
  return error;
}

function mediaTypeVariable(mediaType: MediaType): "ANIME" | "MANGA" {
  return mediaType === "anime" ? "ANIME" : "MANGA";
}

function mediaFormatVariable(mediaType: MediaType): "NOVEL" | null {
  return mediaType === "novel" ? "NOVEL" : null;
}

export class AniListClient implements MetadataProviderClient {
  readonly id = "anilist" as const;
  readonly label = "AniList";

  private readonly requestTimeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly maxInteractiveRetryDelayMs: number;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly cache = new Map<string, CachedPayload>();
  private readonly inFlight = new Map<string, Promise<Record<string, unknown>>>();
  private blockedUntil = 0;

  constructor(options: AniListClientOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? ANILIST_REQUEST_TIMEOUT_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? ANILIST_CACHE_TTL_MS;
    this.maxCacheEntries = options.maxCacheEntries ?? ANILIST_MAX_CACHE_ENTRIES;
    this.maxInteractiveRetryDelayMs = options.maxInteractiveRetryDelayMs ?? ANILIST_MAX_INTERACTIVE_RETRY_DELAY_MS;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)));
  }

  supports(_mediaType: MediaType): boolean { return true; }

  private cacheKey(query: string, variables: Record<string, unknown>): string {
    return JSON.stringify([query, variables]);
  }

  private getCached(key: string): Record<string, unknown> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.payload;
  }

  private setCached(key: string, payload: Record<string, unknown>): void {
    if (this.maxCacheEntries <= 0 || this.cacheTtlMs <= 0) return;
    this.cache.set(key, { expiresAt: this.now() + this.cacheTtlMs, payload });
    while (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
  }

  private async requestWithDeadline(options: Parameters<typeof requestUrl>[0]): Promise<Awaited<ReturnType<typeof requestUrl>>> {
    let timeout: number | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timeout = window.setTimeout(() => reject(new Error(`AniList request timed out after ${this.requestTimeoutMs} ms`)), this.requestTimeoutMs);
    });
    try {
      return await Promise.race([requestUrl(options), deadline]);
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
    }
  }

  private observeRateLimit(headers: unknown): void {
    const remaining = Number(headerValue(headers, "x-ratelimit-remaining"));
    const resetSeconds = Number(headerValue(headers, "x-ratelimit-reset"));
    if (remaining === 0 && Number.isFinite(resetSeconds) && resetSeconds > 0) {
      this.blockedUntil = Math.max(this.blockedUntil, resetSeconds * 1000);
    }
  }

  private async executeGraphQl(query: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.blockedUntil > this.now()) {
      throw new Error(`AniList rate limit is cooling down until ${new Date(this.blockedUntil).toISOString()}`);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.requestWithDeadline({
          url: ANILIST_GRAPHQL_ENDPOINT,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": USER_AGENT,
          },
          body: JSON.stringify({ query, variables }),
        });
        this.observeRateLimit(response.headers);
        const parsed: unknown = response.json ?? JSON.parse(response.text || "{}");
        const payload = record(parsed);
        const graphError = graphQlError(payload);
        if (graphError) throw graphError;
        return payload;
      } catch (error) {
        lastError = error;
        const status = errorStatus(error);
        if (status === 429) {
          const delay = retryAfterMilliseconds(error) ?? 0;
          this.blockedUntil = Math.max(this.blockedUntil, this.now() + delay);
          if (attempt === 0 && delay > 0 && delay <= this.maxInteractiveRetryDelayMs) {
            await this.sleep(delay);
            this.blockedUntil = 0;
            continue;
          }
          throw error;
        }
        if (status !== null && status >= 500 && status < 600 && attempt === 0) {
          await this.sleep(250);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  private async graphQl(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const key = this.cacheKey(query, variables);
    const cached = this.getCached(key);
    if (cached) return cached;
    const current = this.inFlight.get(key);
    if (current !== undefined) return current;

    const request = this.executeGraphQl(query, variables)
      .then((payload) => {
        this.setCached(key, payload);
        return payload;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  private normalizePage(mediaType: MediaType, value: unknown): MetadataProviderPage {
    const pagePayload = record(value);
    let media = asArray(pagePayload.media);
    if (mediaType === "manga") {
      media = media.filter((item) => stringValue(record(item).format).toUpperCase() !== "NOVEL");
    }
    return {
      results: media.map((item) => normalizeAniListMedia(item, mediaType)),
      hasMore: record(pagePayload.pageInfo).hasNextPage === true,
    };
  }

  async searchPages(mediaType: MediaType, queries: string[], page: number): Promise<MetadataProviderPage[]> {
    const cleanQueries = queries.map((query) => query.normalize("NFKC").replace(/\s+/g, " ").trim());
    if (!cleanQueries.length) return [];
    if (cleanQueries.length === 1) return [await this.searchPage(mediaType, cleanQueries[0], page)];

    const normalizedPage = Math.max(1, Math.floor(page));
    const searchVariables = cleanQueries.map((_, index) => `$search${index}: String`).join(", ");
    const pages = cleanQueries.map((_, index) => `
      q${index}: Page(page: $page, perPage: ${ANILIST_SEARCH_PAGE_SIZE}) {
        pageInfo { hasNextPage }
        media(search: $search${index}, type: $type, format: $format, sort: SEARCH_MATCH) {
          ${ANILIST_MEDIA_FIELDS}
        }
      }`).join("\n");
    const graphQuery = `query ($type: MediaType, $format: MediaFormat, $page: Int, ${searchVariables}) {${pages}\n}`;
    const variables: Record<string, unknown> = {
      type: mediaTypeVariable(mediaType),
      format: mediaFormatVariable(mediaType),
      page: normalizedPage,
    };
    cleanQueries.forEach((query, index) => { variables[`search${index}`] = query; });
    const payload = await this.graphQl(graphQuery, variables);
    const data = record(payload.data);
    return cleanQueries.map((_, index) => this.normalizePage(mediaType, data[`q${index}`]));
  }

  async searchPage(mediaType: MediaType, query: string, page: number): Promise<MetadataProviderPage> {
    const normalizedPage = Math.max(1, Math.floor(page));
    const payload = await this.graphQl(ANILIST_MEDIA_SEARCH_QUERY, {
      search: query,
      type: mediaTypeVariable(mediaType),
      format: mediaFormatVariable(mediaType),
      page: normalizedPage,
    });
    return this.normalizePage(mediaType, record(record(payload.data).Page));
  }

  async fetchMediaById(mediaType: MediaType, id: string | number): Promise<ExternalMediaResult | null> {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return null;
    const payload = await this.graphQl(ANILIST_MEDIA_METADATA_QUERY, {
      id: numericId,
      type: mediaTypeVariable(mediaType),
    });
    const media = record(record(payload.data).Media);
    return Object.keys(media).length ? normalizeAniListMedia(media, mediaType) : null;
  }
}
