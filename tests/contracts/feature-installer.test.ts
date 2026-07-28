import assert from "node:assert/strict";
import test from "node:test";
import { installFeatureSet, type FeatureInstaller } from "../../src/app/feature-installer";

test("feature installers run in manifest declaration order", async () => {
  const calls: string[] = [];
  const installers: FeatureInstaller<object>[] = [
    { id: "first", install: () => { calls.push("first"); } },
    { id: "second", install: async () => { calls.push("second"); } },
    { id: "third", install: () => { calls.push("third"); } },
  ];

  await installFeatureSet({}, installers);
  assert.deepEqual(calls, ["first", "second", "third"]);
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
