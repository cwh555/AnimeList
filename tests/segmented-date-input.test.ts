import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { focusSegmentedDateCompletion, normalizeDateParts } from "../src/segmented-date-input";

describe("segmented serial date input", () => {
  it("accepts only complete real calendar dates", () => {
    assert.equal(normalizeDateParts("2026", "07", "27"), "2026-07-27");
    assert.equal(normalizeDateParts("2026", "02", "29"), "");
    assert.equal(normalizeDateParts("2024", "02", "29"), "2024-02-29");
    assert.equal(normalizeDateParts("2026", "7", "27"), "");
    assert.equal(normalizeDateParts("", "", ""), "");
  });

  it("moves a completed date to its explicit next control", () => {
    let focusCount = 0;
    let fallbackCount = 0;
    const sourceControl = {} as HTMLElement;
    const addButton = {
      hasAttribute: () => false,
      focus: () => { focusCount += 1; },
    } as unknown as HTMLElement;

    focusSegmentedDateCompletion(
      sourceControl,
      () => addButton,
      () => { fallbackCount += 1; },
    );

    assert.equal(focusCount, 1);
    assert.equal(fallbackCount, 0);
  });

  it("falls back when the explicit completion target is disabled", () => {
    let fallbackControl: HTMLElement | null = null;
    const sourceControl = {} as HTMLElement;
    const disabledButton = {
      hasAttribute: (name: string) => name === "disabled",
      focus: () => { throw new Error("disabled target must not receive focus"); },
    } as unknown as HTMLElement;

    focusSegmentedDateCompletion(
      sourceControl,
      disabledButton,
      (control) => { fallbackControl = control; },
    );

    assert.equal(fallbackControl, sourceControl);
  });
});
