import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasRecordedProgress, progressPresentation } from "../src/domain/progress/display";

describe("progress presentation", () => {
  it("keeps anime progress numeric", () => {
    assert.deepEqual(progressPresentation({
      mediaType: "anime",
      status: "ongoing",
      progress: 3,
      total: 12,
      unit: "episode",
    }), {
      kind: "numeric",
      ratio: 0.25,
      percentageLabel: "25%",
      hasProgress: true,
    });
  });

  it("keeps anime without a usable total at an empty numeric track", () => {
    assert.deepEqual(progressPresentation({
      mediaType: "anime",
      status: "ongoing",
      progress: 3,
      total: 0,
      unit: "episode",
    }), {
      kind: "numeric",
      ratio: 0,
      percentageLabel: null,
      hasProgress: true,
    });
  });

  it("maps completed serial media to a full state track", () => {
    for (const mediaType of ["manga", "novel"] as const) {
      assert.deepEqual(progressPresentation({
        mediaType,
        status: "completed",
        progress: 0,
        total: 0,
        unit: mediaType === "manga" ? "chapter" : "volume",
      }), {
        kind: "state",
        ratio: 1,
        percentageLabel: null,
        hasProgress: false,
      });
    }
  });

  it("maps ongoing and dropped serial media with progress to a half state track", () => {
    for (const status of ["ongoing", "dropped"] as const) {
      assert.equal(progressPresentation({
        mediaType: "manga",
        status,
        progress: 8,
        total: 0,
        unit: "chapter",
      }).ratio, 0.5);
    }
  });

  it("keeps planned and zero-progress serial media empty", () => {
    assert.equal(progressPresentation({
      mediaType: "novel",
      status: "planned",
      progress: 3,
      total: 0,
      unit: "volume",
    }).ratio, 0);
    assert.equal(progressPresentation({
      mediaType: "novel",
      status: "ongoing",
      progress: 0,
      total: 0,
      unit: "volume",
    }).ratio, 0);
    assert.equal(progressPresentation({
      mediaType: "manga",
      status: "dropped",
      progress: "0",
      total: 0,
      unit: "chapter",
    }).ratio, 0);
  });

  it("recognizes numeric and labeled recorded progress", () => {
    assert.equal(hasRecordedProgress(0), false);
    assert.equal(hasRecordedProgress("0"), false);
    assert.equal(hasRecordedProgress(""), false);
    assert.equal(hasRecordedProgress("1.5"), true);
    assert.equal(hasRecordedProgress("EX"), true);
  });
});
