import assert from "node:assert/strict";
import test from "node:test";
import { installFeatureSet, type FeatureInstaller } from "../../src/app/feature-installer";

test("feature installers run in deterministic order", async () => {
  const calls: string[] = [];
  const installers: FeatureInstaller<object>[] = [
    { id: "later", order: 20, install: () => { calls.push("later"); } },
    { id: "same-b", order: 10, install: () => { calls.push("same-b"); } },
    { id: "same-a", order: 10, install: async () => { calls.push("same-a"); } },
  ];

  await installFeatureSet({}, installers);
  assert.deepEqual(calls, ["same-a", "same-b", "later"]);
});

test("feature installers reject duplicate ids before any installer runs", async () => {
  const calls: string[] = [];
  await assert.rejects(
    installFeatureSet({}, [
      { id: "duplicate", install: () => { calls.push("first"); } },
      { id: "duplicate", install: () => { calls.push("second"); } },
    ]),
    /Duplicate feature installer: duplicate/,
  );
  assert.deepEqual(calls, []);
});
