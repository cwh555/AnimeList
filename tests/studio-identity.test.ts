import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSingleStudioDisplayValue,
  normalizeStudioNames,
  preferredStudioDisplayName,
  studioIdentityKey,
} from "../src/domain/studio-identity";

describe("studio identity", () => {
  it("collapses formatting-only variants without a company alias table", () => {
    assert.equal(studioIdentityKey("A-1 Pictures"), studioIdentityKey("A-1Pictures"));
    assert.equal(studioIdentityKey("WHITE FOX"), studioIdentityKey("WHITEFOX"));
    assert.equal(preferredStudioDisplayName("A-1Pictures", "A-1 Pictures"), "A-1 Pictures");
    assert.equal(preferredStudioDisplayName("WHITEFOX", "WHITE FOX"), "WHITE FOX");
  });

  it("rejects role-labelled and composite metadata blobs before list splitting", () => {
    const composite = "コロリド・ツインエンジンパートナーズ (スタジオコロリド/スタジオクロマト)";
    assert.equal(isSingleStudioDisplayValue("制作:ジェンコ"), false);
    assert.equal(isSingleStudioDisplayValue(composite), false);
    assert.equal(isSingleStudioDisplayValue("コロリド・ツインエンジンパートナーズ (スタジオコロリド"), false);
    assert.equal(isSingleStudioDisplayValue("スタジオクロマト)"), false);
    assert.deepEqual(normalizeStudioNames([composite], 3), []);
    assert.deepEqual(normalizeStudioNames(["スタジオコロリド / スタジオクロマト"], 3), [
      "スタジオコロリド",
      "スタジオクロマト",
    ]);
  });

  it("keeps ordinary provider names and deduplicates equivalent display variants", () => {
    assert.deepEqual(normalizeStudioNames(["Production I.G", "A-1Pictures", "A-1 Pictures"], 3), [
      "Production I.G",
      "A-1 Pictures",
    ]);
  });
});
