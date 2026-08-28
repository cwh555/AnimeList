import assert from "node:assert/strict";
import { test } from "node:test";
import { MANUAL_MEDIA_PROVIDER, manualMediaResult } from "../src/domain/manual-media";

test("manual media produces a normal library-compatible external result", () => {
  const result = manualMediaResult({ title: "自訂作品", mediaType: "manga", originalTitle: "Original" });
  assert.equal(result.provider, MANUAL_MEDIA_PROVIDER);
  assert.equal(result.sourceId, "");
  assert.equal(result.mediaType, "manga");
  assert.equal(result.unit, "chapter");
  assert.equal(result.title, "自訂作品");
});
