import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findImageSectionBlocks, replaceImageSectionPaths,
} from "../src/domain/image-section";
import {
  findMomentsBlocks, replaceMoments,
} from "../src/domain/moments";

describe("fenced Markdown edit identity", () => {
  it("does not overwrite another Image Section when a stale line hint points to it", () => {
    const original = [
      "# Note", "```animelist-images", "- original.jpg", "```",
      "Body must survive.",
    ].join("\n");
    const locator = findImageSectionBlocks(original)[0];
    const latest = [
      "# Note", "```animelist-images", "- someone-else.jpg", "```",
      "Body must survive.", "```animelist-images", "- original.jpg", "```",
    ].join("\n");
    const edited = replaceImageSectionPaths(latest, locator, ["replacement.jpg"]);
    const blocks = findImageSectionBlocks(edited);
    assert.deepEqual(blocks.map(block => block.paths), [
      ["someone-else.jpg"], ["replacement.jpg"],
    ]);
    assert.match(edited, /Body must survive\./);
  });

  it("rejects a concurrent edit of the target Image Section without rewriting the note", () => {
    const original = [
      "Unrelated header", "```animelist-images", "- original.jpg", "```",
    ].join("\n");
    const locator = findImageSectionBlocks(original)[0];
    const changed = original.replace("- original.jpg", "- independently-edited.jpg");
    assert.throws(
      () => replaceImageSectionPaths(changed, locator, ["stale.jpg"]),
      /Could not safely locate/,
    );
    assert.deepEqual(findImageSectionBlocks(changed)[0].paths, ["independently-edited.jpg"]);
  });

  it("targets a moved Moments block by its unchanged content, not the former line", () => {
    const original = [
      "# Note", "```animelist-moments", "moments: []", "```",
    ].join("\n");
    const locator = findMomentsBlocks(original)[0];
    const latest = [
      "# Note", "```animelist-moments", "moments:",
      '  - id: "m_other123"', "    text: other", "    images:",
      '      - "elsewhere.jpg"', "```",
      "Keep this body.",
      "```animelist-moments", "moments: []", "```",
    ].join("\n");
    const updated = replaceMoments(latest, locator, [{
      id: "m_created123", text: "new", images: ["new.jpg"],
    }]);
    const blocks = findMomentsBlocks(updated);
    assert.equal(blocks[0].moments[0].id, "m_other123");
    assert.equal(blocks[1].moments[0].id, "m_created123");
    assert.match(updated, /Keep this body\./);
  });

  it("rejects a changed Moments block rather than overwriting concurrent text", () => {
    const original = ["```animelist-moments", "moments: []", "```"].join("\n");
    const locator = findMomentsBlocks(original)[0];
    const current = original.replace("moments: []", [
      "moments:", '  - id: "m_other123"', "    text: edited",
      "    images:", '      - "keep.jpg"',
    ].join("\n"));
    assert.throws(() => replaceMoments(current, locator, []), /Could not safely locate/);
    assert.equal(findMomentsBlocks(current)[0].moments[0].text, "edited");
  });
  it("refuses ambiguous identical image sections when there is no reliable line hint", () => {
    const original = ["# Note", "```animelist-images", "- a.png", "```"].join("\n");
    const source = findImageSectionBlocks(original)[0].source;
    const now = [original, "", "```animelist-images", "- a.png", "```"].join("\n");
    assert.throws(() => replaceImageSectionPaths(now, { source }, ["new.png"]), /Could not safely locate/);
    assert.deepEqual(findImageSectionBlocks(now).map(b => b.paths), [["a.png"], ["a.png"]]);
  });

  it("rejects a repeated block when the saved exact range no longer exists", () => {
    const original = ["# Note", "```animelist-images", "- a.png", "```"].join("\n");
    const locator = findImageSectionBlocks(original)[0];
    const now = ["An inserted heading", "", original,
      "", "```animelist-images", "- a.png", "```"].join("\n");
    assert.throws(() => replaceImageSectionPaths(now, locator, ["new.png"]), /Could not safely locate/);
  });

  it("does not overwrite a user comment added inside the target image section", () => {
    const original = ["```animelist-images", "- a.png", "```"].join("\n");
    const locator = findImageSectionBlocks(original)[0];
    const latest = original.replace("- a.png", "- a.png\n# user annotation");
    assert.throws(() => replaceImageSectionPaths(latest, locator, ["new.png"]), /Could not safely locate/);
    assert.match(latest, /# user annotation/);
  });

  it("does not overwrite new YAML comments inside an existing Moments section", () => {
    const original = ["```animelist-moments", "moments: []", "```"].join("\n");
    const locator = findMomentsBlocks(original)[0];
    const latest = original.replace("moments: []", "moments: []\n# manually documented");
    assert.throws(() => replaceMoments(latest, locator, []), /Could not safely locate/);
    assert.match(latest, /# manually documented/);
  });

});
