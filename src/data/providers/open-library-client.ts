import { requestUrl } from "obsidian";
import { withProviderRequestDeadline } from "./request-deadline";
import { USER_AGENT } from "../../app-metadata";
import type { MediaType } from "../../domain/media-types";
import { asArray, stringArray, stringValue } from "../../domain/value-normalization";
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

export interface OpenLibraryVolumeEdition {
  workId: string;
  editionId: string;
  workTitle: string;
  title: string;
  isbn: string[];
  coverUrl: string;
}

export interface OpenLibraryVolumeWork {
  id: string;
  title: string;
  editions: OpenLibraryVolumeEdition[];
}

function editionRecord(workId: string, workTitle: string, value: unknown): OpenLibraryVolumeEdition | null {
  const edition = record(value);
  const editionId = stringValue(edition.key).replace(/^\/books\//, "");
  const coverId = optionalNumber(edition.cover_i) ?? optionalNumber(asArray(edition.covers)[0]);
  if (!/^OL\d+M$/.test(editionId) || coverId === null || coverId <= 0) return null;
  return {
    workId, editionId, workTitle, title: stringValue(edition.title),
    isbn: stringArray(edition.isbn ?? edition.isbn_13),
    coverUrl: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`,
  };
}

export class OpenLibraryClient implements MetadataProviderClient {
  readonly id = "openlibrary" as const;
  readonly label = "Open Library";

  supports(mediaType: MediaType): boolean { return mediaType === "novel"; }

  /** Publication search: unlike Add Media, both comics and novels may have editions here. */
  async searchBookEditions(query: string, page = 1, mode: "title" | "q" = "title"): Promise<{ works: OpenLibraryVolumeWork[]; hasMore: boolean }> {
    const fields = "key,title,cover_i,isbn,editions,editions.key,editions.title,editions.isbn,editions.cover_i";
    const parameters = new URLSearchParams({ [mode]: query, fields, limit: "50", page: String(page) });
    const response = await withProviderRequestDeadline("Open Library", () => requestUrl({
      url: `${OPEN_LIBRARY_SEARCH_ENDPOINT}?${parameters.toString()}`,
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    }));
    const payload = record(response.json ?? JSON.parse(response.text || "{}"));
    const docs = asArray(payload.docs).map(record);
    const works = docs.map(doc => {
      const id = stringValue(doc.key).replace(/^\/works\//, "");
      const title = stringValue(doc.title);
      const editions = asArray(record(doc.editions).docs)
        .map(value => editionRecord(id, title, value))
        .filter((entry): entry is OpenLibraryVolumeEdition => entry !== null);
      return { id, title, editions };
    }).filter(work => /^OL\d+W$/.test(work.id));
    return { works, hasMore: (optionalNumber(payload.start) ?? (page - 1) * 50) + docs.length < (optionalNumber(payload.numFound) ?? 0) };
  }

  async fetchWorkEditions(workId: string, workTitle: string): Promise<OpenLibraryVolumeEdition[]> {
    if (!/^OL\d+W$/.test(workId)) return [];
    const response = await withProviderRequestDeadline("Open Library", () => requestUrl({
      url: `https://openlibrary.org/works/${encodeURIComponent(workId)}/editions.json?limit=50`,
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    }));
    const payload = record(response.json ?? JSON.parse(response.text || "{}"));
    return asArray(payload.entries).map(value => editionRecord(workId, workTitle, value))
      .filter((entry): entry is OpenLibraryVolumeEdition => entry !== null);
  }

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
