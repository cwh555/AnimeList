import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  buildStyleBundle,
  GENERATED_STYLE_END,
  GENERATED_STYLE_START,
  STYLE_SOURCES,
} from "../../scripts/style-bundle.mjs";

describe("stylesheet bundle contract", () => {
  it("reproduces the committed release stylesheet without mutating sources", async () => {
    const before = await Promise.all(STYLE_SOURCES.map((path) => readFile(path, "utf8")));
    const generated = await buildStyleBundle();
    const release = await readFile("styles.css", "utf8");
    const after = await Promise.all(STYLE_SOURCES.map((path) => readFile(path, "utf8")));

    assert.equal(generated, release);
    assert.deepEqual(after, before);
    assert.equal(generated.match(new RegExp(GENERATED_STYLE_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length, 1);
    assert.equal(generated.match(new RegExp(GENERATED_STYLE_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length, 1);
  });
});
