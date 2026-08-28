import assert from "node:assert/strict";
import { test } from "node:test";
import { abortable, isOperationCancelled } from "../src/domain/abort";

test("abortable returns immediately on cancellation even when the source promise keeps running", async () => {
  const controller = new AbortController();
  let resolveSource!: (value: string) => void;
  const source = new Promise<string>((resolve) => { resolveSource = resolve; });
  const wrapped = abortable(source, controller.signal);
  controller.abort();
  await assert.rejects(wrapped, (error) => isOperationCancelled(error));
  resolveSource("late result");
  await source;
});
