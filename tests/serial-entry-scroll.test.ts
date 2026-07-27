import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  captureScrollPosition,
  findNewestSerialLabelInput,
} from "../src/serial-entry-scroll-stability";

interface MutableView {
  scrollX: number;
  scrollY: number;
  scrollTo(left: number, top: number): void;
}

function fakeElement(
  ownerDocument: Document,
  parentElement: HTMLElement | null,
  scrollLeft: number,
  scrollTop: number,
): HTMLElement {
  return {
    ownerDocument,
    parentElement,
    scrollLeft,
    scrollTop,
  } as unknown as HTMLElement;
}

describe("serial entry scroll stability", () => {
  it("restores nested editor, modal, document, and window positions", () => {
    const view: MutableView = {
      scrollX: 19,
      scrollY: 73,
      scrollTo(left, top) {
        this.scrollX = left;
        this.scrollY = top;
      },
    };
    const documentLike = {
      defaultView: view,
      scrollingElement: null,
    } as unknown as Document;
    const page = fakeElement(documentLike, null, 4, 300);
    const modal = fakeElement(documentLike, page, 7, 160);
    const editor = fakeElement(documentLike, modal, 0, 28);
    Reflect.set(documentLike, "scrollingElement", page);

    const snapshot = captureScrollPosition(editor);
    editor.scrollTop = 0;
    modal.scrollLeft = 0;
    modal.scrollTop = 0;
    page.scrollTop = 0;
    view.scrollX = 0;
    view.scrollY = 0;

    snapshot.restore();

    assert.equal(editor.scrollTop, 28);
    assert.equal(modal.scrollLeft, 7);
    assert.equal(modal.scrollTop, 160);
    assert.equal(page.scrollTop, 300);
    assert.equal(view.scrollX, 19);
    assert.equal(view.scrollY, 73);
  });

  it("selects the unit input from the newest row, not a segmented date input", () => {
    const previousInput = { value: "1" } as HTMLInputElement;
    const newestInput = { value: "2" } as HTMLInputElement;
    const previousRow = {
      querySelector: () => previousInput,
    } as unknown as HTMLElement;
    const newestRow = {
      querySelector: (selector: string) => {
        assert.equal(
          selector,
          ".al-volume-row-fields > .al-form-field:first-child > input",
        );
        return newestInput;
      },
    } as unknown as HTMLElement;
    const rows = [previousRow, newestRow] as unknown as NodeListOf<HTMLElement>;
    Reflect.set(rows, "item", (index: number) => rows[index] ?? null);
    const editor = {
      querySelectorAll: () => rows,
    } as unknown as HTMLElement;

    assert.equal(findNewestSerialLabelInput(editor), newestInput);
  });
});
