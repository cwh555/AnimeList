import { requestUrl } from "obsidian";

const DEFAULT_MINIMUM_INTERVAL_MS = 2_100;
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1_000;

interface AniListPayload<T> {
  data?: T | null;
  errors?: Array<{ message?: string | null; status?: number | null }> | null;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

export interface AniListGraphQLOptions {
  cacheKey?: string;
  cacheTtlMs?: number;
  maxRetries?: number;
}

let queue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;
let blockedUntil = 0;
let minimumIntervalMs = DEFAULT_MINIMUM_INTERVAL_MS;
const responseCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

function sleep(milliseconds: number): Promise<void> {
  return milliseconds > 0
    ? new Promise((resolve) => window.setTimeout(resolve, milliseconds))
    : Promise.resolve();
}

function headerValue(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return "";
  const wanted = name.toLocaleLowerCase();
  return Object.entries(headers).find(([key]) => key.toLocaleLowerCase() === wanted)?.[1] ?? "";
}

function retryDelayMs(headers: Record<string, string> | undefined): number {
  const retryAfter = Number(headerValue(headers, "retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter * 1_000);
  const reset = Number(headerValue(headers, "x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) return Math.max(0, Math.ceil(reset * 1_000 - Date.now()));
  return 60_000;
}

function payloadError(payload: AniListPayload<unknown>, fallback: string): Error {
  const message = payload.errors?.map((entry) => entry.message).filter(Boolean).join("; ");
  return new Error(message || fallback);
}

async function scheduledRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  userAgent: string,
  maxRetries: number,
): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const waitUntil = Math.max(nextRequestAt, blockedUntil);
      await sleep(waitUntil - Date.now());
      const response = await requestUrl({
        url: "https://graphql.anilist.co",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": userAgent,
        },
        body: JSON.stringify({ query, variables }),
        throw: false,
      });
      nextRequestAt = Date.now() + minimumIntervalMs;
      const status = Number(response.status || 200);
      const payload = (response.json ?? JSON.parse(response.text || "{}")) as AniListPayload<T>;
      if (status === 429) {
        const delay = retryDelayMs(response.headers);
        blockedUntil = Math.max(blockedUntil, Date.now() + delay);
        if (attempt < maxRetries) continue;
        throw payloadError(payload, `AniList rate limit exceeded. Retry after ${Math.ceil(delay / 1_000)} seconds.`);
      }
      if (status < 200 || status >= 300) {
        throw payloadError(payload, `AniList request failed with HTTP ${status}.`);
      }
      if (payload.errors?.length) throw payloadError(payload, "AniList GraphQL request failed.");
      if (payload.data == null) throw new Error("AniList returned no data.");
      return payload.data;
    }
    throw new Error("AniList request failed.");
  };

  const result = queue.then(run, run);
  queue = result.then<void>(() => undefined, () => undefined);
  return result;
}

export async function requestAniListGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  userAgent: string,
  options: AniListGraphQLOptions = {},
): Promise<T> {
  const cacheKey = options.cacheKey ?? JSON.stringify([query, variables]);
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) responseCache.delete(cacheKey);

  const existing = inFlight.get(cacheKey);
  if (existing !== undefined) return existing as Promise<T>;

  const pending = scheduledRequest<T>(query, variables, userAgent, options.maxRetries ?? 1)
    .then((value) => {
      responseCache.set(cacheKey, {
        expiresAt: Date.now() + (options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS),
        value,
      });
      return value;
    })
    .finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, pending);
  return pending;
}

export const aniListRequestTest = {
  reset(): void {
    queue = Promise.resolve();
    nextRequestAt = 0;
    blockedUntil = 0;
    minimumIntervalMs = DEFAULT_MINIMUM_INTERVAL_MS;
    responseCache.clear();
    inFlight.clear();
  },
  setMinimumInterval(milliseconds: number): void {
    minimumIntervalMs = Math.max(0, milliseconds);
  },
};
