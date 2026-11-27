import { after, before } from "node:test";

/** Provide the browser timer surface required by metadata provider clients. */
export function installProviderWindow(): void {
  const originalWindow = globalThis.window;
  before(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        setTimeout: (handler: TimerHandler, timeout?: number) => setTimeout(handler, timeout),
        clearTimeout: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
      } as unknown as Window & typeof globalThis,
    });
  });
  after(() => {
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  });
}
