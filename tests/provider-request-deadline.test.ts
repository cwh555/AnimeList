import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OTHER_PROVIDER_REQUEST_DEADLINE_MS, withProviderRequestDeadline } from "../src/data/providers/request-deadline";
import type { ProviderDeadlineClock } from "../src/data/providers/request-deadline";

function clockHarness() {
  const scheduled: Array<{ callback: () => void; milliseconds: number; cleared: boolean }> = [];
  const clock: ProviderDeadlineClock = {
    schedule(callback, milliseconds) {
      scheduled.push({ callback, milliseconds, cleared: false });
      return scheduled.length - 1;
    },
    cancel(handle) { const entry = scheduled[handle]; if (entry) entry.cleared = true; },
  };
  return { clock, scheduled };
}

describe("interactive provider request deadline", () => {
  it("limits a never-resolving provider without starting a second network request", async () => {
    const h = clockHarness();
    let requests = 0;
    const search = withProviderRequestDeadline("Bangumi", () => {
      requests++;
      return new Promise<string>(() => { /* upstream request is unabortable */ });
    }, OTHER_PROVIDER_REQUEST_DEADLINE_MS, h.clock);
    assert.equal(requests, 1);
    assert.equal(h.scheduled[0]?.milliseconds, 6_000);
    h.scheduled[0]?.callback();
    await assert.rejects(search, /Bangumi request timed out after 6000 ms/);
    assert.equal(h.scheduled[0]?.cleared, true);
    assert.equal(requests, 1, "physical retries must not be launched on a logical timeout");
  });

  it("returns completed provider responses and releases the timeout timer", async () => {
    const h = clockHarness();
    const result = await withProviderRequestDeadline(
      "Open Library", async () => ({ results: ["book"] }), 6_000, h.clock,
    );
    assert.deepEqual(result, { results: ["book"] });
    assert.equal(h.scheduled[0]?.cleared, true);
  });

  it("keeps original provider errors and ignores late successes after timeout", async () => {
    const failing = clockHarness();
    await assert.rejects(
      withProviderRequestDeadline("Bangumi", async () => { throw new Error("HTTP 503"); }, 6_000, failing.clock),
      /HTTP 503/,
    );
    assert.equal(failing.scheduled[0]?.cleared, true);

    const late = clockHarness();
    let finish!: (value: string) => void;
    const request = new Promise<string>((resolve) => { finish = resolve; });
    const pending = withProviderRequestDeadline("Open Library", () => request, 6_000, late.clock);
    late.scheduled[0]?.callback();
    await assert.rejects(pending, /Open Library request timed out/);
    finish("late provider response");
    await Promise.resolve();
    assert.equal(late.scheduled[0]?.cleared, true);
  });
});
