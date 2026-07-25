import { requestUrl } from "obsidian";
import {
  rankSerialCoverCandidates,
  type RankedSerialCoverCandidate,
  type SerialCoverCandidate,
} from "./serial-entry-cover";

const SUCCESS_CACHE_TTL_MS = 30 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 2 * 60 * 1000;
const REQUEST_INTERVAL_MS = 1500;
const MAX_ATTEMPTS = 5;
const resultCache = new Map<string, { expiresAt: number; value: RankedSerialCoverCandidate[] }>();
const inFlight = new Map<string, Promise<RankedSerialCoverCandidate[]>>();
let queueTail: Promise<void> = Promise.resolve();
let nextRequestAt = 0;
let sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
let random = (): number => Math.random();

function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }

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

async function requestWithBackoff(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await waitForRequestSlot();
    try {
      const response = await requestUrl({
        url,
        method: "GET",
        headers: { Accept: "application/json" },
      });
      return response.json ?? JSON.parse(response.text || "{}");
    } catch (error) {
      lastError = error;
      const status = errorStatus(error);
      if (status !== 429 && (status === null || status < 500 || status >= 600)) throw error;
      if (attempt === MAX_ATTEMPTS - 1) break;
      const serverDelay = retryAfterMilliseconds(error);
      const exponentialDelay = Math.min(30_000, 1500 * (2 ** attempt));
      await sleep(serverDelay ?? exponentialDelay + Math.floor(random() * 500));
    }
  }
  throw lastError;
}

async function requestSerialCovers(
  query: string,
  originalTitle: string,
  label: string,
): Promise<RankedSerialCoverCandidate[]> {
  const parameters = new URLSearchParams({
    q: query,
    maxResults: "20",
    printType: "books",
    langRestrict: "ja",
    projection: "lite",
    fields: "items(id,volumeInfo(title,subtitle,infoLink,imageLinks))",
  });
  const payload = record(await requestWithBackoff(`https://www.googleapis.com/books/v1/volumes?${parameters.toString()}`));
  const candidates = asArray(payload?.items)
    .map(googleBookCandidate)
    .filter((candidate): candidate is SerialCoverCandidate => candidate !== null);
  return rankSerialCoverCandidates(candidates, originalTitle, label);
}

export async function searchSerialCovers(
  query: string,
  originalTitle: string,
  label: string,
): Promise<RankedSerialCoverCandidate[]> {
  const key = query.normalize("NFKC").trim();
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = inFlight.get(key);
  if (pending !== undefined) return pending;

  const request = enqueue(() => requestSerialCovers(query, originalTitle, label))
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
