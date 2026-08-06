import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addUserTagToCatalog,
  mergeUserTagCatalog,
  removeUserTagFromCatalog,
  renameUserTagInCatalog,
} from "../src/domain/user-tag-catalog";

describe("user tag catalog", () => {
  it("keeps a persistent reusable catalog independent from one work's selection", () => {
    const catalog = mergeUserTagCatalog(["重看", "收藏"], ["戀愛", "重看"]);
    assert.deepEqual(catalog, ["重看", "收藏", "戀愛"]);
    assert.deepEqual(addUserTagToCatalog(catalog, "  治癒系  "), ["重看", "收藏", "戀愛", "治癒系"]);
    assert.deepEqual(removeUserTagFromCatalog(catalog, "戀愛"), ["重看", "收藏"]);
  });

  it("renames case-insensitively and merges an existing destination without duplicates", () => {
    assert.deepEqual(renameUserTagInCatalog(["Comfort Watch", "收藏"], "comfort watch", "重看"), ["重看", "收藏"]);
    assert.deepEqual(renameUserTagInCatalog(["重看", "收藏"], "重看", "收藏"), ["收藏"]);
    assert.deepEqual(renameUserTagInCatalog(["重看"], "重看", "重 看"), ["重 看"]);
  });
});
