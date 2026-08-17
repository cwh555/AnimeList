import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findImageSectionBlocks } from "../src/domain/image-section";
import {
  DEFAULT_IMAGE_SECTION_COLUMNS,
  imageSectionColumnBuckets,
  parseImageSectionColumns,
  setImageSectionColumns,
} from "../src/domain/image-section-layout";
import {
  moveImageSectionPath,
  planImageSectionPathMove,
  reorderImageSectionPaths,
} from "../src/domain/image-section-order";

describe("image section layout model", () => {
  it("keeps legacy sections at four columns and parses explicit column metadata", () => {
    assert.equal(parseImageSectionColumns("```animelist-images\n- one.jpg\n```"), DEFAULT_IMAGE_SECTION_COLUMNS);
    assert.equal(parseImageSectionColumns("```animelist-images columns=2\n- one.jpg\n```"), 2);
    assert.equal(parseImageSectionColumns("```animelist-images columns=99\n```"), 6);
    assert.equal(parseImageSectionColumns("```animelist-images columns=oops\n```"), DEFAULT_IMAGE_SECTION_COLUMNS);
  });

  it("updates only the selected opening fence while preserving unrelated metadata and note content", () => {
    const markdown = [
      "# Demo",
      "```animelist-images fit=contain columns=2 custom=yes",
      "- one.jpg",
      "```",
      "Keep this paragraph.",
      "```animelist-images",
      "- two.jpg",
      "```",
      "",
    ].join("\n");
    const first = findImageSectionBlocks(markdown)[0];
    const updated = setImageSectionColumns(markdown, first, 5);
    assert.match(updated, /```animelist-images fit=contain custom=yes columns=5\n- one\.jpg/);
    assert.match(updated, /Keep this paragraph\./);
    assert.match(updated, /```animelist-images\n- two\.jpg\n```/);

    const reset = setImageSectionColumns(updated, findImageSectionBlocks(updated)[0], 4);
    assert.match(reset, /```animelist-images fit=contain custom=yes\n- one\.jpg/);
    assert.doesNotMatch(reset.split("\n")[1], /columns=/);
  });

  it("builds independent round-robin columns while preserving a stable flat source order", () => {
    assert.deepEqual(imageSectionColumnBuckets([1, 2, 3, 4, 5, 6], 4), [
      [1, 5], [2, 6], [3], [4],
    ]);
  });
});

describe("image section ordering model", () => {
  it("reorders within a section before, after, and at the end", () => {
    const paths = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"];
    assert.deepEqual(reorderImageSectionPaths(paths, "d.jpg", "b.jpg", "before"), ["a.jpg", "d.jpg", "b.jpg", "c.jpg"]);
    assert.deepEqual(reorderImageSectionPaths(paths, "a.jpg", "c.jpg", "after"), ["b.jpg", "c.jpg", "a.jpg", "d.jpg"]);
    assert.deepEqual(reorderImageSectionPaths(paths, "b.jpg", "", "append"), ["a.jpg", "c.jpg", "d.jpg", "b.jpg"]);
  });

  it("plans same-section and cross-section moves from one ordering model", () => {
    const same = planImageSectionPathMove(
      ["a.jpg", "b.jpg", "c.jpg"],
      ["a.jpg", "b.jpg", "c.jpg"],
      "c.jpg",
      "a.jpg",
      "before",
      true,
    );
    assert.deepEqual(same, {
      sourcePaths: ["c.jpg", "a.jpg", "b.jpg"],
      targetPaths: ["c.jpg", "a.jpg", "b.jpg"],
      changed: true,
    });

    const cross = planImageSectionPathMove(
      ["a.jpg", "b.jpg"],
      ["c.jpg", "d.jpg"],
      "b.jpg",
      "d.jpg",
      "before",
      false,
    );
    assert.deepEqual(cross, {
      sourcePaths: ["a.jpg"],
      targetPaths: ["c.jpg", "b.jpg", "d.jpg"],
      changed: true,
    });
  });

  it("moves an image between sections atomically without changing fence metadata or unrelated Markdown", () => {
    const markdown = [
      "# Demo",
      "## One",
      "```animelist-images columns=3 custom=keep",
      "- a.jpg",
      "- b.jpg",
      "```",
      "Do not touch this paragraph.",
      "## Two",
      "```animelist-images columns=5",
      "- c.jpg",
      "- d.jpg",
      "```",
      "",
    ].join("\n");
    const [source, target] = findImageSectionBlocks(markdown);
    const result = moveImageSectionPath(markdown, source, target, "b.jpg", "d.jpg", "before");

    assert.match(result.markdown, /```animelist-images columns=3 custom=keep\n- a\.jpg\n```/);
    assert.match(result.markdown, /Do not touch this paragraph\./);
    assert.match(result.markdown, /```animelist-images columns=5\n- c\.jpg\n- b\.jpg\n- d\.jpg\n```/);
    assert.equal(result.sourceSection.source, "- a.jpg");
    assert.equal(result.targetSection.source, "- c.jpg\n- b.jpg\n- d.jpg");
    assert.ok(result.targetSection.lineStart < target.lineStart, "target line moves upward after source loses a line");
  });
});
