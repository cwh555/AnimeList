import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LIBRARY_TEXT_TEMPLATE_MAX_LENGTH,
  compileLibraryTextTemplate,
  renderLibraryTextTemplate,
  type LibraryTextTemplateCatalog,
  type LibraryTextTemplateVariableId,
} from "../src/domain/library-text-template";

const catalog: LibraryTextTemplateCatalog = {
  names: {
    completedAt: "完成時間",
    work: "作品名稱",
    seriesTitle: "系列名稱",
    mediaType: "作品類型",
    unit: "單位",
    originalTitle: "原文名稱",
    score: "評分",
    progress: "進度",
    startedAt: "開始時間",
    status: "狀態",
    favorite: "最愛",
    genres: "分類標籤",
  },
};

function values(overrides: Partial<Record<LibraryTextTemplateVariableId, string>> = {}) {
  return {
    completedAt: "2026-05-03",
    work: "葬送的芙莉蓮 — 第 13 卷",
    seriesTitle: "葬送的芙莉蓮",
    mediaType: "漫畫",
    unit: "第 13 卷",
    originalTitle: "葬送のフリーレン",
    score: "9",
    progress: "13 卷",
    startedAt: "2026-05-01",
    status: "已完成",
    favorite: "最愛",
    genres: "奇幻, 冒險",
    ...overrides,
  } satisfies Record<LibraryTextTemplateVariableId, string>;
}

describe("library text template", () => {
  it("supports localized bash-like substitutions", () => {
    const compiled = compileLibraryTextTemplate(
      "({$作品類型}) {$作品名稱} : {$完成時間}",
      catalog,
    );
    assert.equal(compiled.valid, true);
    assert.equal(
      renderLibraryTextTemplate(compiled, values()),
      "(漫畫) 葬送的芙莉蓮 — 第 13 卷 : 2026-05-03",
    );
  });

  it("requires work but keeps every other supported field optional", () => {
    const workAndScore = compileLibraryTextTemplate("{$作品名稱} {$評分}", catalog);
    assert.equal(workAndScore.valid, true);
    assert.equal(renderLibraryTextTemplate(workAndScore, values()), "葬送的芙莉蓮 — 第 13 卷 9");

    const scoreOnly = compileLibraryTextTemplate("{$評分}", catalog);
    assert.equal(scoreOnly.valid, false);
    assert.ok(scoreOnly.issues.some((issue) => issue.code === "missing-work"));

    const literalOnly = compileLibraryTextTemplate("固定文字", catalog);
    assert.equal(literalOnly.valid, false);
    assert.ok(literalOnly.issues.some((issue) => issue.code === "missing-work"));
  });

  it("accepts typed aliases so renamed display variables remain compatible", () => {
    const aliasedCatalog: LibraryTextTemplateCatalog = {
      ...catalog,
      aliases: { favorite: ["masterpiece"] },
    };
    const compiled = compileLibraryTextTemplate("{$作品名稱} {$masterpiece}", aliasedCatalog);
    assert.equal(compiled.valid, true);
    assert.equal(
      renderLibraryTextTemplate(compiled, values({ favorite: "character writing" })),
      "葬送的芙莉蓮 — 第 13 卷 character writing",
    );
  });

  it("never recursively evaluates substituted values and supports an escaped literal opener", () => {
    const compiled = compileLibraryTextTemplate(
      "{$作品名稱} / \\{$評分} / {$完成時間}",
      catalog,
    );
    assert.equal(compiled.valid, true);
    assert.equal(
      renderLibraryTextTemplate(compiled, values({ work: "作品 {$評分}" })),
      "作品 {$評分} / {$評分} / 2026-05-03",
    );
  });

  it("rejects unsafe or ambiguous templates before export", () => {
    const unknown = compileLibraryTextTemplate("{$作品名稱} {$rm -rf}", catalog);
    assert.equal(unknown.valid, false);
    assert.deepEqual(unknown.issues.find((issue) => issue.code === "unknown-variable")?.variable, "rm -rf");

    const unclosed = compileLibraryTextTemplate("{$作品名稱} {$評分", catalog);
    assert.equal(unclosed.valid, false);
    assert.ok(unclosed.issues.some((issue) => issue.code === "unclosed-variable"));

    const tooLong = compileLibraryTextTemplate(
      `{$作品名稱}${"x".repeat(LIBRARY_TEXT_TEMPLATE_MAX_LENGTH)}`,
      catalog,
    );
    assert.equal(tooLong.valid, false);
    assert.ok(tooLong.issues.some((issue) => issue.code === "template-too-long"));
  });
});
