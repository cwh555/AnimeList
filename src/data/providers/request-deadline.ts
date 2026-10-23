/** Interactive search time budget, separate from AniList's rate-limited client. */
export const OTHER_PROVIDER_REQUEST_DEADLINE_MS = 6_000;

export interface ProviderDeadlineClock {
  schedule(callback: () => void, milliseconds: number): number;
  cancel(handle: number): void;
}

const browserClock: ProviderDeadlineClock = {
  schedule(callback, milliseconds) { return window.setTimeout(callback, milliseconds); },
  cancel(handle) { window.clearTimeout(handle); },
};

/**
 * Bounds how long the UI waits for a metadata request. Obsidian requestUrl
 * does not expose an abort signal: a timed-out physical request may continue,
 * so callers must not automatically retry or launch a replacement burst.
 */
export async function withProviderRequestDeadline<T>(
  provider: string,
  request: () => Promise<T>,
  milliseconds = OTHER_PROVIDER_REQUEST_DEADLINE_MS,
  clock: ProviderDeadlineClock = browserClock,
): Promise<T> {
  let timer: number | null = null;
  const deadline = new Promise<never>((_, reject) => {
    timer = clock.schedule(
      () => reject(new Error(`${provider} request timed out after ${milliseconds} ms`)),
      milliseconds,
    );
  });
  try {
    return await Promise.race([request(), deadline]);
  } finally {
    if (timer !== null) clock.cancel(timer);
  }
}
