import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMediaFormContext } from "../src/ui/media-form-controls";

function context() {
  return createMediaFormContext({
    mode: "create",
    plugin: {} as never,
    modalEl: {} as HTMLElement,
    formEl: {} as HTMLElement,
    mediaType: "anime",
    result: null,
    file: null,
    frontmatter: {},
    fields: {} as never,
  });
}

describe("media form disposal lifecycle", () => {
  it("runs registered disposers once", () => {
    const form = context();
    let calls = 0;
    form.onDispose(() => { calls += 1; });
    form.dispose();
    form.dispose();
    assert.equal(calls, 1);
  });

  it("allows a disposer to be unregistered", () => {
    const form = context();
    let calls = 0;
    const unregister = form.onDispose(() => { calls += 1; });
    unregister();
    form.dispose();
    assert.equal(calls, 0);
  });

  it("immediately runs a disposer registered after disposal", () => {
    const form = context();
    form.dispose();
    let calls = 0;
    form.onDispose(() => { calls += 1; });
    assert.equal(calls, 1);
  });
});
