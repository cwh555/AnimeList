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
    const timelineCardRules = [...generated.matchAll(/\.al-timeline-card\s*\{([^}]*)\}/g)];
    const finalTimelineCardRule = timelineCardRules.at(-1)?.[1] ?? "";
    assert.match(finalTimelineCardRule, /height:\s*242px/);

    const timelineImageRules = [...generated.matchAll(/\.al-timeline-card img\s*\{([^}]*)\}/g)];
    const finalTimelineImageRule = timelineImageRules.at(-1)?.[1] ?? "";
    assert.match(finalTimelineImageRule, /width:\s*100%/);
    assert.match(finalTimelineImageRule, /height:\s*180px/);
    assert.match(finalTimelineImageRule, /object-fit:\s*contain/);
    assert.match(finalTimelineImageRule, /object-position:\s*center/);
    assert.match(finalTimelineImageRule, /background:\s*var\(--background-primary-alt/);
  });
});
