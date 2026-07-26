import { requestUrl } from "obsidian";
import {
  confidentSerialCover,
  manualSerialCoverQueries,
  rankManualSerialCoverCandidates,
  rankSerialCoverCandidates,
  serialCoverQueries,
  type RankedSerialCoverCandidate,
  type SerialCoverCandidate,
} from "./serial-entry-cover";

const SUCCESS_CACHE_TTL_MS = 30 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 2 * 60 * 1000;
const REQUEST_INTERVAL_MS = 750;
const MAX_ATTEMPTS = 5;
const BANGUMI_SEARCH_URL = "https://api.bgm.tv/v0/search/subjects";
const GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes";
const USER_AGENT = "AnimeList/1.1.2 (https://github.com/cwh555/AnimeList)";

type SerialMediaType = "manga" | "novel";
type RequestOptions = Parameters<typeof requestUrl>[0];

const resultCache = new Map<string, { expiresAt: number; value: RankedSerialCoverCandidate[] }>();
const inFlight = new Map<string, Promise<RankedSerialCoverCandidate[]>>();
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

function comparable(value: unknown): string {
  return text(value).normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function mediaTypeFromPlatform(value: unknown): SerialMediaType | undefined {
  const platform = text(value).normalize("NFKC").toLocaleLowerCase();
  if (/漫画|manga|comic|コミック/.test(platform)) return "manga";
  if (/小说|小説|轻小说|輕小說|light\s*novel|novel|文庫|文库/.test(platform)) return "novel";
  return undefined;
}

function infoboxValues(value: unknown, keys: string[]): string[] {
  const wanted = new Set(keys.map((key) => key.toLocaleLowerCase()));
  const output: string[] = [];
  for (const raw of asArray(value)) {
    const row = record(raw);
    if (!row || !wanted.has(text(row.key).toLocaleLowerCase())) continue;
    const rawValue = row.value;
    for (const entry of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      const nested = record(entry);
      const candidate = nested ? text(nested.v ?? nested.k) : text(entry);
      if (candidate && !output.includes(candidate)) output.push(candidate);
    }
  }
  return output;
}

function bangumiCandidate(value: unknown): SerialCoverCandidate | null {
  const item = record(value);
  const images = record(item?.images);
  const sourceId = text(item?.id);
  const title = text(item?.name).trim();
  const coverUrl = text(images?.large)
    || text(images?.common)
    || text(images?.medium)
    || text(images?.small)
    || text(images?.grid);
  if (!item || !sourceId || !title || !coverUrl) return null;
  const platform = text(item.platform);
  const metaTags = asArray(item.meta_tags).map(text).filter(Boolean);
  const formatMetadata = [
    platform,
    ...metaTags,
    ...infoboxValues(item.infobox, ["书系", "書系", "文库", "文庫", "连载杂志", "連載雑誌"]),
  ].filter(Boolean).join(" ");
  return {
    provider: "Bangumi",
    sourceId,
    title,
    coverUrl: coverUrl.replace(/^http:/, "https:"),
    infoUrl: `https://bgm.tv/subject/${sourceId}`,
    categories: [platform, ...metaTags].filter(Boolean),
    authors: infoboxValues(item.infobox, ["作者", "原作", "作画", "插图", "插畫"]),
    publisher: infoboxValues(item.infobox, ["出版社"])[0] ?? "",
    mediaTypeHint: mediaTypeFromPlatform(formatMetadata),
  };
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

function deduplicateCandidates(candidates: SerialCoverCandidate[]): SerialCoverCandidate[] {
  const seen = new Set<string>();
  const output: SerialCoverCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.mediaTypeHint ?? "unknown"}:${comparable(candidate.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output;
}

async function searchBangumi(
  query: string,
  mediaType: SerialMediaType,
  strictMediaType = true,
): Promise<SerialCoverCandidate[]> {
  const payload = record(await requestWithBackoff({
    url: `${BANGUMI_SEARCH_URL}?limit=50&offset=0`,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ keyword: query, sort: "match", filter: { type: [1] } }),
  }));
  const opposite = mediaType === "novel" ? "manga" : "novel";
  const candidates = asArray(payload?.data)
    .map(bangumiCandidate)
    .filter((candidate): candidate is SerialCoverCandidate => (
      candidate !== null && (!strictMediaType || candidate.mediaTypeHint !== opposite)
    ))
    .sort((left, right) => Number(right.mediaTypeHint === mediaType) - Number(left.mediaTypeHint === mediaType))
    .map((candidate) => candidate.mediaTypeHint
      ? candidate
      : { ...candidate, mediaTypeHint: mediaType });
  return deduplicateCandidates(candidates);
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
  return deduplicateCandidates(asArray(payload?.items)
    .map(googleBookCandidate)
    .filter((candidate): candidate is SerialCoverCandidate => candidate !== null));
}

async function requestSerialCovers(
  query: string,
  originalTitle: string,
  label: string,
  mediaType: SerialMediaType,
): Promise<RankedSerialCoverCandidate[]> {
  const queries: string[] = [];
  const seenQueries = new Set<string>();
  for (const candidateQuery of [query, ...serialCoverQueries(originalTitle, label)]) {
    const key = candidateQuery.normalize("NFKC").trim();
    if (!key || seenQueries.has(key)) continue;
    seenQueries.add(key);
    queries.push(candidateQuery);
  }
  let bangumiCandidates: SerialCoverCandidate[] = [];
  let bangumiError: unknown;

  for (const bangumiQuery of queries) {
    try {
      bangumiCandidates = deduplicateCandidates([
        ...bangumiCandidates,
        ...await searchBangumi(bangumiQuery, mediaType),
      ]);
    } catch (error) {
      bangumiError ??= error;
      continue;
    }
    const ranked = rankSerialCoverCandidates(bangumiCandidates, originalTitle, label, mediaType);
    if (confidentSerialCover(ranked)) return ranked;
  }

  const rankedBangumi = rankSerialCoverCandidates(bangumiCandidates, originalTitle, label, mediaType);
  if (rankedBangumi.length > 0) return rankedBangumi;
  if (apiKey) {
    const googleCandidates = await searchGoogleBooks(query);
    if (googleCandidates.length > 0) {
      return rankSerialCoverCandidates(googleCandidates, originalTitle, label, mediaType);
    }
  }
  if (bangumiError !== undefined) throw bangumiError;
  return [];
}

async function requestManualSerialCovers(
  query: string,
  queryTitle: string,
  referenceTitle: string,
  label: string,
  mediaType: SerialMediaType,
): Promise<RankedSerialCoverCandidate[]> {
  const queries: string[] = [];
  const seenQueries = new Set<string>();
  for (const candidateQuery of [
    query,
    ...manualSerialCoverQueries(queryTitle, label),
    ...manualSerialCoverQueries(referenceTitle, label),
  ]) {
    const key = candidateQuery.normalize("NFKC").trim();
    if (!key || seenQueries.has(key)) continue;
    seenQueries.add(key);
    queries.push(candidateQuery);
  }

  let bangumiCandidates: SerialCoverCandidate[] = [];
  let bangumiError: unknown;
  for (const bangumiQuery of queries) {
    try {
      bangumiCandidates = deduplicateCandidates([
        ...bangumiCandidates,
        ...await searchBangumi(bangumiQuery, mediaType, false),
      ]);
    } catch (error) {
      bangumiError ??= error;
    }
  }

  if (bangumiCandidates.length > 0) {
    return rankManualSerialCoverCandidates(bangumiCandidates, queryTitle, label, mediaType, referenceTitle);
  }
  if (apiKey) {
    const googleCandidates = await searchGoogleBooks(query);
    if (googleCandidates.length > 0) {
      return rankManualSerialCoverCandidates(googleCandidates, queryTitle, label, mediaType, referenceTitle);
    }
  }
  if (bangumiError !== undefined) throw bangumiError;
  return [];
}

export async function searchSerialCovers(
  query: string,
  originalTitle: string,
  label: string,
  mediaType: SerialMediaType,
): Promise<RankedSerialCoverCandidate[]> {
  const key = `${mediaType}:${query.normalize("NFKC").trim()}`;
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = inFlight.get(key);
  if (pending !== undefined) return pending;

  const request = enqueue(() => requestSerialCovers(query, originalTitle, label, mediaType))
    .then((value) => {
      resultCache.set(key, {
        expiresAt: Date.now() + (value.length ? SUCCESS_CACHE_TTL_MS : EMPTY_CACHE_TTL_MS),
        value,
      });
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

export async function searchManualSerialCovers(
  query: string,
  queryTitle: string,
  referenceTitle: string,
  label: string,
  mediaType: SerialMediaType,
): Promise<RankedSerialCoverCandidate[]> {
  const key = `manual:${mediaType}:${query.normalize("NFKC").trim()}:${referenceTitle.normalize("NFKC").trim()}`;
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = inFlight.get(key);
  if (pending !== undefined) return pending;

  const request = enqueue(() => requestManualSerialCovers(query, queryTitle, referenceTitle, label, mediaType))
    .then((value) => {
      resultCache.set(key, {
        expiresAt: Date.now() + (value.length ? SUCCESS_CACHE_TTL_MS : EMPTY_CACHE_TTL_MS),
        value,
      });
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

export function clearSerialCoverProviderCache(): void {
  resultCache.clear();
  inFlight.clear();
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
  clearSerialCoverProviderCache();
}
