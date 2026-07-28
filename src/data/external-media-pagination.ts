import { requestUrl } from "obsidian";
import { USER_AGENT } from "../app-metadata";
import type { ExternalMediaResult, MediaType } from "../domain/media-types";
import type { ProviderSettings } from "../domain/settings-types";
import { rankSearchResults } from "../search";
import {
  dedupeSearchResults,
  normalizeAniListMedia,
  normalizeBangumiSubject,
  normalizeOpenLibraryBook,
} from "./provider-normalizers";

const PAGE_RESULT_LIMIT = 24;

export interface ExternalSearchPage {
  results: ExternalMediaResult[];
  warnings: string[];
  hasMore: boolean;
}

export interface ExternalSearchPageSettings {
  providers?: ProviderSettings;
}

interface ProviderPage {
  items: ExternalMediaResult[];
  hasMore: boolean;
}

interface ProviderTaskResult {
  provider: string;
  page?: ProviderPage;
  error?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) || "Unknown error";
  } catch {
    return "Unknown error";
  }
}

async function searchBangumiPage(mediaType: MediaType, query: string, page: number): Promise<ProviderPage> {
  const limit = 20;
  const offset = (page - 1) * limit;
  const response = await requestUrl({
    url: `https://api.bgm.tv/v0/search/subjects?limit=${limit}&offset=${offset}`,
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({
      keyword: query,
      sort: "match",
      filter: { type: [mediaType === "anime" ? 2 : 1], nsfw: false },
    }),
  });
  const parsed: unknown = response.json ?? JSON.parse(response.text || "{}");
  const payload = isRecord(parsed) ? parsed : {};
  const subjects = asArray(payload.data);
  const total = numberValue(payload.total);
  return {
    items: subjects.map((subject) => normalizeBangumiSubject(subject, mediaType)),
    hasMore: total === null ? subjects.length === limit : offset + subjects.length < total,
  };
}

async function searchAniListPage(mediaType: MediaType, query: string, page: number): Promise<ProviderPage> {
  const graphQuery = `
    query ($search: String, $type: MediaType, $format: MediaFormat, $page: Int) {
      Page(page: $page, perPage: 20) {
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
  const response = await requestUrl({
    url: "https://graphql.anilist.co",
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({
      query: graphQuery,
      variables: {
        search: query,
        type: mediaType === "anime" ? "ANIME" : "MANGA",
        format: mediaType === "novel" ? "NOVEL" : null,
        page,
      },
    }),
  });
  const parsed: unknown = response.json ?? JSON.parse(response.text || "{}");
  const payload = isRecord(parsed) ? parsed : {};
  const data = isRecord(payload.data) ? payload.data : {};
  const pagePayload = isRecord(data.Page) ? data.Page : {};
  let media = asArray(pagePayload.media);
  if (mediaType === "manga") {
    media = media.filter((item) => {
      if (!isRecord(item)) return true;
      const format = typeof item.format === "string" ? item.format : "";
      return format.toUpperCase() !== "NOVEL";
    });
  }
  const pageInfo = isRecord(pagePayload.pageInfo) ? pagePayload.pageInfo : {};
  return {
    items: media.map((item) => normalizeAniListMedia(item, mediaType)),
    hasMore: pageInfo.hasNextPage === true,
  };
}

async function searchOpenLibraryPage(query: string, page: number): Promise<ProviderPage> {
  const limit = 8;
  const fields = "key,title,author_name,first_publish_year,cover_i,subject";
  const response = await requestUrl({
    url: `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&limit=${limit}&page=${page}&lang=zh`,
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  const parsed: unknown = response.json ?? JSON.parse(response.text || "{}");
  const payload = isRecord(parsed) ? parsed : {};
  const docs = asArray(payload.docs);
  const total = numberValue(payload.numFound);
  const start = numberValue(payload.start) ?? (page - 1) * limit;
  return {
    items: docs.map((item) => normalizeOpenLibraryBook(item)),
    hasMore: total === null ? docs.length === limit : start + docs.length < total,
  };
}

function providerTask(provider: string, task: Promise<ProviderPage>): Promise<ProviderTaskResult> {
  return task.then((page) => ({ provider, page })).catch((error: unknown) => ({ provider, error }));
}

export async function fetchExternalSearchPage(
  settings: ExternalSearchPageSettings,
  mediaType: MediaType,
  query: string,
  page: number,
): Promise<ExternalSearchPage> {
  const providers = settings.providers ?? { bangumi: true, anilist: true, openlibrary: true };
  const tasks: Array<Promise<ProviderTaskResult>> = [];
  if (providers.bangumi) tasks.push(providerTask("Bangumi", searchBangumiPage(mediaType, query, page)));
  if (providers.anilist) tasks.push(providerTask("AniList", searchAniListPage(mediaType, query, page)));
  if (mediaType === "novel" && providers.openlibrary) {
    tasks.push(providerTask("Open Library", searchOpenLibraryPage(query, page)));
  }
  const settled = await Promise.all(tasks);
  const warnings = settled
    .filter((entry) => entry.error !== undefined)
    .map((entry) => `${entry.provider}: ${errorMessage(entry.error)}`);
  const merged = dedupeSearchResults(settled.flatMap((entry) => entry.page?.items ?? []));
  return {
    results: rankSearchResults(merged, query).slice(0, PAGE_RESULT_LIMIT),
    warnings,
    hasMore: settled.some((entry) => entry.page?.hasMore === true),
  };
}
