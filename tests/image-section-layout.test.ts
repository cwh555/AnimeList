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
  planImageSectionPathMove,
  reorderImageSectionPaths,
  replaceImageSectionOrders,
  resolveImageSectionPendingOrders,
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

  it("persists final orders for multiple sections atomically without overwriting unrelated note content", () => {
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
    const [first, second] = findImageSectionBlocks(markdown);
    const result = replaceImageSectionOrders(markdown, [
      { locator: first, expectedPaths: ["a.jpg", "b.jpg"], paths: ["b.jpg", "a.jpg"] },
      { locator: second, expectedPaths: ["c.jpg", "d.jpg"], paths: ["d.jpg", "c.jpg"] },
    ]);

    assert.match(result.markdown, /```animelist-images columns=3 custom=keep\n- b\.jpg\n- a\.jpg\n```/);
    assert.match(result.markdown, /Do not touch this paragraph\./);
    assert.match(result.markdown, /```animelist-images columns=5\n- d\.jpg\n- c\.jpg\n```/);
    assert.deepEqual(result.sections.map((section) => section.source), [
      "- b.jpg\n- a.jpg",
      "- d.jpg\n- c.jpg",
    ]);
  });

  it("relocates a delayed absolute-order commit after unrelated Markdown shifts its old line hint", () => {
    const original = [
      "# Demo",
      "```animelist-images",
      "- first.jpg",
      "```",
      "```animelist-images columns=3 custom=keep",
      "- a.jpg",
      "- b.jpg",
      "```",
      "Tail.",
    ].join("\n");
    const target = findImageSectionBlocks(original)[1];
    const shifted = [
      "# Demo",
      "```animelist-images",
      "- first.jpg",
      "- inserted-into-other-section.jpg",
      "- another-line.jpg",
      "```",
      "```animelist-images columns=3 custom=keep",
      "- a.jpg",
      "- b.jpg",
      "```",
      "Tail.",
    ].join("\n");
    const result = replaceImageSectionOrders(shifted, [{
      locator: target,
      expectedPaths: ["a.jpg", "b.jpg"],
      paths: ["b.jpg", "a.jpg"],
    }]);
    assert.match(result.markdown, /- inserted-into-other-section\.jpg\n- another-line\.jpg/);
    assert.match(result.markdown, /```animelist-images columns=3 custom=keep\n- b\.jpg\n- a\.jpg/);
    assert.match(result.markdown, /Tail\./);
  });

  it("rejects a delayed absolute-order commit when the target section changed underneath it", () => {
    const original = [
      "# Demo",
      "```animelist-images",
      "- a.jpg",
      "- b.jpg",
      "```",
      "",
    ].join("\n");
    const block = findImageSectionBlocks(original)[0];
    const changed = original.replace("- b.jpg", "- externally-added.jpg\n- b.jpg");
    assert.throws(() => replaceImageSectionOrders(changed, [{
      locator: block,
      expectedPaths: ["a.jpg", "b.jpg"],
      paths: ["b.jpg", "a.jpg"],
    }]), /changed before the pending order/);
  });

  it("replaces cross-section orders atomically without changing fence metadata or unrelated Markdown", () => {
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
    const result = replaceImageSectionOrders(markdown, [
      { locator: source, expectedPaths: ["a.jpg", "b.jpg"], paths: ["a.jpg"] },
      { locator: target, expectedPaths: ["c.jpg", "d.jpg"], paths: ["c.jpg", "b.jpg", "d.jpg"] },
    ]);

    assert.match(result.markdown, /```animelist-images columns=3 custom=keep\n- a\.jpg\n```/);
    assert.match(result.markdown, /Do not touch this paragraph\./);
    assert.match(result.markdown, /```animelist-images columns=5\n- c\.jpg\n- b\.jpg\n- d\.jpg\n```/);
    assert.equal(result.sections[0].source, "- a.jpg");
    assert.equal(result.sections[1].source, "- c.jpg\n- b.jpg\n- d.jpg");
    assert.ok(result.sections[1].lineStart < target.lineStart, "target line moves upward after source loses a line");
  });
  it("reconciles pending, already-committed, and externally changed orders without overwriting conflicts", () => {
    const markdown = [
      "# Demo",
      "```animelist-images",
      "- a.jpg",
      "- b.jpg",
      "```",
      "```animelist-images",
      "- d.jpg",
      "- c.jpg",
      "```",
      "```animelist-images",
      "- external.jpg",
      "```",
      "",
    ].join("\n");
    const resolutions = resolveImageSectionPendingOrders(markdown, [
      { lineStart: 1, expectedPaths: ["a.jpg", "b.jpg"], paths: ["b.jpg", "a.jpg"] },
      { lineStart: 5, expectedPaths: ["c.jpg", "d.jpg"], paths: ["d.jpg", "c.jpg"] },
      { lineStart: 9, expectedPaths: ["x.jpg"], paths: ["y.jpg", "x.jpg"] },
    ]);
    assert.deepEqual(resolutions.map((entry) => entry.status), ["pending", "committed", "conflict"]);
    assert.equal(resolutions[0]?.locator?.lineStart, 1);
  });

});
