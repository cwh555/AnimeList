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
    const timelineCardRules = [...generated.matchAll(/\.al-timeline-card\s*\{([^}]*)\}/g)].map((match) => match[1]);
    assert.ok(timelineCardRules.some((rule) => /height:\s*180px/.test(rule)));

    const timelineImageRules = [...generated.matchAll(/\.al-timeline-card img\s*\{([^}]*)\}/g)].map((match) => match[1]);
    assert.ok(timelineImageRules.some((rule) => /width:\s*100%/.test(rule)
      && /height:\s*100%/.test(rule)
      && /object-fit:\s*cover/.test(rule)
      && /object-position:\s*center/.test(rule)
      && /background:\s*var\(--background-primary-alt/.test(rule)));
  });
});
