import { requestUrl } from "obsidian";
import { withProviderRequestDeadline } from "./request-deadline";
import { USER_AGENT } from "../../app-metadata";
import type { MediaType } from "../../domain/media-types";
import { asArray } from "../../domain/value-normalization";
import type { MetadataProviderClient, MetadataProviderPage } from "../external-media-provider";
import { normalizeOpenLibraryBook } from "../provider-normalizers";
import { getActiveLocale } from "../../i18n/catalog";
import { normalizeSupportedLocale, type SupportedLocale } from "../../i18n/locale";

const OPEN_LIBRARY_SEARCH_ENDPOINT = "https://openlibrary.org/search.json";
const OPEN_LIBRARY_PAGE_SIZE = 8;
const OPEN_LIBRARY_FIELDS = "key,title,author_name,first_publish_year,cover_i,subject";

/** Open Library lang affects edition preference, not title-language verification. */
export function openLibrarySearchLanguage(locale: SupportedLocale): string {
  return locale.startsWith("zh-") ? "zh" : locale;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export class OpenLibraryClient implements MetadataProviderClient {
  readonly id = "openlibrary" as const;
  readonly label = "Open Library";

  supports(mediaType: MediaType): boolean { return mediaType === "novel"; }

  async searchPage(_mediaType: MediaType, query: string, page: number): Promise<MetadataProviderPage> {
    const normalizedPage = Math.max(1, Math.floor(page));
    const locale = normalizeSupportedLocale(getActiveLocale()) ?? "zh-TW";
    const language = openLibrarySearchLanguage(locale);
    const response = await withProviderRequestDeadline("Open Library", () => requestUrl({
      url: `${OPEN_LIBRARY_SEARCH_ENDPOINT}?title=${encodeURIComponent(query)}&fields=${encodeURIComponent(OPEN_LIBRARY_FIELDS)}&limit=${OPEN_LIBRARY_PAGE_SIZE}&page=${normalizedPage}&lang=${language}`,
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    }));
    const parsed: unknown = response.json ?? JSON.parse(response.text || "{}");
    const payload = record(parsed);
    const docs = asArray(payload.docs);
    const total = optionalNumber(payload.numFound);
    const start = optionalNumber(payload.start) ?? (normalizedPage - 1) * OPEN_LIBRARY_PAGE_SIZE;
    return {
      results: docs.map(normalizeOpenLibraryBook),
      hasMore: total === null
        ? docs.length === OPEN_LIBRARY_PAGE_SIZE
        : start + docs.length < total,
    };
  }
}
