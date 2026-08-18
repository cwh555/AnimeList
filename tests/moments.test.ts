import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allMomentIds,
  allMomentImagePaths,
  createMomentId,
  findMomentsBlocks,
  hasUniqueMomentIds,
  hasUniqueMomentIdsInMarkdown,
  momentsInsertionPlan,
  parseMomentsSource,
  replaceMoments,
  serializeMomentsSource,
} from "../src/domain/moments";

describe("moments Markdown model", () => {
  it("round-trips multiline text, optional metadata, and one-to-many image rows in human-readable YAML-like data", () => {
    const source = [
      "moments:",
      '  - id: "m_first123"',
      "    text: |-",
      "      人類的壽命太短了。",
      "      為什麼我當時沒有更了解他呢？",
      '    source: "第 1 話"',
      '    position: "旅途的記憶"',
      '    speaker: "芙莉蓮"',
      "    tags:",
      '      - "回憶片段"',
      '      - "辛美爾"',
      "    note: |-",
      "      單張圖片不該出現捲動列。",
      "      Metadata 應保留多行文字。",
      "    images:",
      '      - "AnimeList/Images/frieren/001.jpg"',
      '  - id: "m_second456"',
      "    text: |-",
      "      這幕真的很好笑。",
      "    images:",
      '      - "AnimeList/Images/frieren/003.png"',
    ].join("\n");
    const parsed = parseMomentsSource(source);
    assert.deepEqual(parsed, [
      {
        id: "m_first123",
        text: "人類的壽命太短了。\n為什麼我當時沒有更了解他呢？",
        source: "第 1 話",
        position: "旅途的記憶",
        speaker: "芙莉蓮",
        tags: ["回憶片段", "辛美爾"],
        note: "單張圖片不該出現捲動列。\nMetadata 應保留多行文字。",
        images: ["AnimeList/Images/frieren/001.jpg"],
      },
      { id: "m_second456", text: "這幕真的很好笑。", images: ["AnimeList/Images/frieren/003.png"] },
    ]);
    assert.deepEqual(parseMomentsSource(serializeMomentsSource(parsed)), parsed);
  });

  it("round-trips stacked image layout metadata while legacy moments stay carousel-compatible", () => {
    const source = [
      "moments:",
      '  - id: "m_stacked123"',
      "    text: stacked subtitles",
      "    imageLayout: stacked",
      "    stackReveal: 52",
      "    stackFocusY:",
      "      - 50",
      "      - 81",
      "      - 94",
      "    images:",
      '      - "a.jpg"',
      '      - "b.jpg"',
      '      - "c.jpg"',
      '  - id: "m_legacy123"',
      "    text: legacy carousel",
      "    images:",
      '      - "legacy-a.jpg"',
      '      - "legacy-b.jpg"',
    ].join("\n");
    const parsed = parseMomentsSource(source);
    assert.deepEqual(parsed[0], {
      id: "m_stacked123",
      text: "stacked subtitles",
      imageLayout: "stacked",
      stackReveal: 52,
      stackFocusY: [50, 81, 94],
      images: ["a.jpg", "b.jpg", "c.jpg"],
    });
    assert.deepEqual(parsed[1], {
      id: "m_legacy123",
      text: "legacy carousel",
      images: ["legacy-a.jpg", "legacy-b.jpg"],
    });
    const serialized = serializeMomentsSource(parsed);
    assert.match(serialized, /imageLayout: stacked/);
    assert.doesNotMatch(serialized.split('m_legacy123')[1] ?? "", /imageLayout:/);
    assert.deepEqual(parseMomentsSource(serialized), parsed);
  });

  it("updates only one reusable moments block while preserving unrelated note content", () => {
    const markdown = [
      "---", "title: Demo", "custom: keep", "---", "", "# Demo", "",
      "## Quotes", "```animelist-moments", "moments: []", "```", "",
      "Personal paragraph must stay.", "",
      "## Memes", "```animelist-moments", "moments: []", "```", "",
    ].join("\n");
    const blocks = findMomentsBlocks(markdown);
    assert.equal(blocks.length, 2);
    const updated = replaceMoments(markdown, blocks[1], [{
      id: "m_unique123",
      text: "保存這一幕。",
      source: "第 1 話",
      tags: ["名場面"],
      images: ["AnimeList/Images/demo/scene.jpg"],
    }]);
    assert.match(updated, /custom: keep/);
    assert.match(updated, /Personal paragraph must stay\./);
    assert.match(updated, /## Quotes\n```animelist-moments\nmoments: \[\]\n```/);
    assert.match(updated, /## Memes[\s\S]*m_unique123[\s\S]*source: "第 1 話"[\s\S]*scene\.jpg/);
    assert.deepEqual(allMomentIds(updated), ["m_unique123"]);
    assert.deepEqual(allMomentImagePaths(updated), ["AnimeList/Images/demo/scene.jpg"]);
  });

  it("creates stable unique IDs without recording an existing candidate twice", () => {
    const candidates = ["same-id", "same-id", "new-id"];
    const generated = createMomentId(["m_sameid"], () => candidates.shift() ?? "fallback-id");
    assert.equal(generated, "m_newid");
    assert.equal(hasUniqueMomentIds([
      { id: "m_a12345", text: "a", images: ["a.jpg"] },
      { id: "m_b12345", text: "b", images: ["b.jpg"] },
    ]), true);
    assert.equal(hasUniqueMomentIds([
      { id: "m_same", text: "a", images: ["a.jpg"] },
      { id: "m_same", text: "b", images: ["b.jpg"] },
    ]), false);
    const duplicatedAcrossSections = [
      "```animelist-moments", "moments:", '  - id: "m_cross123"', "    text: one", "    images:", '      - "a.jpg"', "```",
      "```animelist-moments", "moments:", '  - id: "m_cross123"', "    text: two", "    images:", '      - "b.jpg"', "```",
    ].join("\n");
    assert.equal(hasUniqueMomentIdsInMarkdown(duplicatedAcrossSections), false);
  });

  it("plans a context-menu insertion without replacing existing text", () => {
    assert.deepEqual(momentsInsertionPlan(8, "Keep this paragraph"), {
      at: { line: 8, ch: 19 },
      text: "\n\n```animelist-moments\nmoments: []\n```\n",
      cursor: { line: 13, ch: 0 },
    });
    assert.deepEqual(momentsInsertionPlan(2, "   "), {
      at: { line: 2, ch: 0 },
      text: "```animelist-moments\nmoments: []\n```\n",
      cursor: { line: 5, ch: 0 },
    });
  });
});
