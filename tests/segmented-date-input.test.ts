import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  focusSegmentedDateCompletion,
  handleSegmentedDateBackspace,
  normalizeDateParts,
} from "../src/segmented-date-input";

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

  it("moves an empty year back to the previous form control", () => {
    let fallbackSource: HTMLElement | null = null;
    const year = { value: "" } as HTMLInputElement;

    const handled = handleSegmentedDateBackspace(
      year,
      null,
      "Backspace",
      (source) => {
        fallbackSource = source;
        return true;
      },
    );

    assert.equal(handled, true);
    assert.equal(fallbackSource, year);
  });

  it("does not leave a year that still contains text", () => {
    let fallbackCount = 0;
    const year = { value: "2026" } as HTMLInputElement;

    const handled = handleSegmentedDateBackspace(
      year,
      null,
      "Backspace",
      () => {
        fallbackCount += 1;
        return true;
      },
    );

    assert.equal(handled, false);
    assert.equal(fallbackCount, 0);
  });

  it("keeps month and day backspace navigation on the previous segment", () => {
    let focusCount = 0;
    let selectCount = 0;
    let fallbackCount = 0;
    const month = { value: "" } as HTMLInputElement;
    const year = {
      focus: () => { focusCount += 1; },
      select: () => { selectCount += 1; },
    } as unknown as HTMLInputElement;

    const handled = handleSegmentedDateBackspace(
      month,
      year,
      "Backspace",
      () => {
        fallbackCount += 1;
        return true;
      },
    );

    assert.equal(handled, true);
    assert.equal(focusCount, 1);
    assert.equal(selectCount, 1);
    assert.equal(fallbackCount, 0);
  });
});
