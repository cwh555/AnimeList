import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backspaceWillClearInput } from "../src/ui/serial-entry-keyboard-navigation";

describe("serial entry keyboard navigation", () => {
  it("moves backward when Backspace starts from an empty input", () => {
    assert.equal(backspaceWillClearInput({ value: "", selectionStart: 0, selectionEnd: 0 }), true);
  });

  it("moves backward when Backspace clears a selected value", () => {
    assert.equal(backspaceWillClearInput({ value: "2026", selectionStart: 0, selectionEnd: 4 }), true);
  });

  it("moves backward when Backspace removes the final character", () => {
    assert.equal(backspaceWillClearInput({ value: "7", selectionStart: 1, selectionEnd: 1 }), true);
  });

  it("stays in the current input while text remains", () => {
    assert.equal(backspaceWillClearInput({ value: "2026", selectionStart: 4, selectionEnd: 4 }), false);
    assert.equal(backspaceWillClearInput({ value: "2026", selectionStart: 2, selectionEnd: 4 }), false);
  });
});
