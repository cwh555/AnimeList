export class OperationCancelledError extends Error {
  constructor(message = "Operation cancelled") {
    super(message);
    this.name = "AbortError";
  }
}

export function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw new OperationCancelledError();
}

/** Return immediately on cancellation even if the wrapped API has no native abort support. */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(new OperationCancelledError());
    signal.addEventListener("abort", cancel, { once: true });
    promise.then(
      (value) => { signal.removeEventListener("abort", cancel); resolve(value); },
      (error) => {
        signal.removeEventListener("abort", cancel);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export function isOperationCancelled(error: unknown): boolean {
  return error instanceof OperationCancelledError
    || (error instanceof Error && error.name === "AbortError");
}
