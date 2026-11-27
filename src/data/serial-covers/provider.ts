import { requestUrl } from "obsidian";
import { USER_AGENT } from "../../app-metadata";
import { searchMetadataCoverCandidates, uniqueSerialCoverSources, type SerialCoverMetadataSearch } from "./metadata-candidates";
import {
  manualSerialCoverQueries,
  rankManualSerialCoverCandidates,
  rankSerialCoverCandidates,
  serialCoverQueries,
  type RankedSerialCoverCandidate,
  type SerialCoverCandidate,
} from "../../domain/serial-covers/ranking";

const REQUEST_INTERVAL_MS = 750;
const MAX_ATTEMPTS = 5;
const GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes";

type SerialMediaType = "manga" | "novel";
type RequestOptions = Parameters<typeof requestUrl>[0];

let queueTail: Promise<void> = Promise.resolve();
let nextRequestAt = 0;
let sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
let random = (): number => Math.random();
let apiKey = "";

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function googleBookCandidate(value: unknown): SerialCoverCandidate | null {
  const item = record(value);
  const info = record(item?.volumeInfo);
  const images = record(info?.imageLinks);
  const coverUrl = text(images?.extraLarge)
    || text(images?.large)
    || text(images?.medium)
    || text(images?.thumbnail);
  const title = [text(info?.title), text(info?.subtitle)].filter(Boolean).join(" ");
  if (!item || !title || !coverUrl) return null;
  return {
    provider: "Google Books",
    sourceId: text(item.id),
    title,
    coverUrl: coverUrl.replace(/^http:/, "https:"),
    infoUrl: text(info?.infoLink),
    categories: asArray(info?.categories).map(text).filter(Boolean),
    authors: asArray(info?.authors).map(text).filter(Boolean),
    publisher: text(info?.publisher),
  };
}

function errorStatus(error: unknown): number | null {
  const candidate = record(error);
  for (const value of [candidate?.status, candidate?.statusCode, record(candidate?.response)?.status]) {
    const status = Number(value);
    if (Number.isInteger(status) && status > 0) return status;
  }
  const match = error instanceof Error ? error.message.match(/\b(429|5\d\d)\b/) : null;
  return match ? Number(match[1]) : null;
}

function retryAfterMilliseconds(error: unknown): number | null {
  const headers = record(record(error)?.response)?.headers;
  const value = headers instanceof Headers
    ? headers.get("Retry-After")
    : text(record(headers)?.["retry-after"] ?? record(headers)?.["Retry-After"]);
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

async function waitForRequestSlot(): Promise<void> {
  const wait = Math.max(0, nextRequestAt - Date.now());
  if (wait > 0) await sleep(wait);
  nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const previous = queueTail;
  let release!: () => void;
  queueTail = new Promise<void>((resolve) => { release = resolve; });
  return previous.then(operation).finally(release);
}

async function requestWithBackoff(options: RequestOptions): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await waitForRequestSlot();
    try {
      const response = await requestUrl(options);
      return response.json ?? JSON.parse(response.text || "{}");
    } catch (error) {
      lastError = error;
      const status = errorStatus(error);
      if (status !== 429 && (status === null || status < 500 || status >= 600)) throw error;
      if (attempt === MAX_ATTEMPTS - 1) break;
      const serverDelay = retryAfterMilliseconds(error);
      const exponentialDelay = Math.min(30_000, 1000 * (2 ** attempt));
      await sleep(serverDelay ?? exponentialDelay + Math.floor(random() * 500));
    }
  }
  throw lastError;
}

async function searchGoogleBooks(query: string): Promise<SerialCoverCandidate[]> {
  if (!apiKey) return [];
  const parameters = new URLSearchParams({
    q: query,
    maxResults: "20",
    printType: "books",
    langRestrict: "ja",
    projection: "lite",
    fields: "items(id,volumeInfo(title,subtitle,authors,publisher,categories,infoLink,imageLinks))",
    key: apiKey,
  });
  const payload = record(await requestWithBackoff({
    url: `${GOOGLE_BOOKS_URL}?${parameters.toString()}`,
    method: "GET",
    headers: { Accept: "application/json" },
  }));
  return uniqueSerialCoverSources(asArray(payload?.items)
    .map(googleBookCandidate)
    .filter((candidate): candidate is SerialCoverCandidate => candidate !== null));
}

/**
 * Provider selection, rate limits and network clients are owned by the main
 * metadata search service. The only additional source is optional Google Books.
 * Retry one abbreviated title only when the exact volume is still missing.
 */
async function searchConfiguredCoverSources(
  metadataSearch: SerialCoverMetadataSearch,
  mediaType: SerialMediaType,
  queries: string[],
  title: string,
  label: string,
): Promise<SerialCoverCandidate[]> {
  let candidates: SerialCoverCandidate[] = [];
  let firstError: unknown;
  for (const query of queries.slice(0, 2)) {
    try {
      candidates = uniqueSerialCoverSources([
        ...candidates,
        ...await searchMetadataCoverCandidates(metadataSearch, mediaType, query),
      ]);
    } catch (error) {
      firstError ??= error;
    }
    if (rankSerialCoverCandidates(candidates, title, label, mediaType).length) break;
  }
  try {
    candidates = uniqueSerialCoverSources([...candidates, ...await searchGoogleBooks(queries[0] ?? "")]);
  } catch (error) {
    firstError ??= error;
  }
  if (candidates.length === 0 && firstError !== undefined) throw firstError;
  return candidates;
}

/** The only text-search path; provider enablement is owned by the supplied host adapter. */
export async function searchSerialCovers(
  query: string,
  originalTitle: string,
  label: string,
  mediaType: SerialMediaType,
  metadataSearch: SerialCoverMetadataSearch,
): Promise<RankedSerialCoverCandidate[]> {
  const queries = uniqueQueries([query, ...serialCoverQueries(originalTitle, label)]);
  return enqueue(async () => rankSerialCoverCandidates(
    await searchConfiguredCoverSources(metadataSearch, mediaType, queries, originalTitle, label),
    originalTitle, label, mediaType,
  ));
}

export async function searchManualSerialCovers(
  query: string,
  queryTitle: string,
  referenceTitle: string,
  label: string,
  mediaType: SerialMediaType,
  metadataSearch: SerialCoverMetadataSearch,
): Promise<RankedSerialCoverCandidate[]> {
  const queries = uniqueQueries([query, ...manualSerialCoverQueries(queryTitle, label), ...manualSerialCoverQueries(referenceTitle, label)]);
  return enqueue(async () => rankManualSerialCoverCandidates(
    await searchConfiguredCoverSources(metadataSearch, mediaType, queries, queryTitle, label),
    queryTitle, label, mediaType, referenceTitle,
  ));
}

function uniqueQueries(queries: readonly string[]): string[] {
  const seen = new Set<string>();
  return queries.filter(query => {
    const key = query.normalize("NFKC").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resetSerialCoverProviderForTests(): void {
  queueTail = Promise.resolve();
  nextRequestAt = 0;
}

export function configureSerialCoverProviderForTests(options: {
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}): void {
  if (options.sleep) sleep = options.sleep;
  if (options.random) random = options.random;
}

export function configureSerialCoverProvider(options: { apiKey?: string }): void {
  const nextKey = options.apiKey?.trim() ?? "";
  if (nextKey === apiKey) return;
  apiKey = nextKey;
}
