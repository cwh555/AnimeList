import assert from "node:assert/strict";
import test from "node:test";
import { Menu, type Editor } from "obsidian";
import { addImageSectionContextMenu } from "../src/image-section-feature";

function editorHarness(): { editor: Editor; inserted: string[] } {
  const inserted: string[] = [];
  const editor = {
    getCursor: () => ({ line: 3, ch: 5 }),
    getLine: () => "existing text",
    replaceRange: (text: string) => { inserted.push(text); },
    setCursor: () => {},
  } as unknown as Editor;
  return { editor, inserted };
}

test("image section editor menu uses Obsidian native submenu instead of drawing its own arrow", () => {
  const { editor, inserted } = editorHarness();
  const menu = new Menu();
  addImageSectionContextMenu(menu, editor);

  assert.equal(menu.items.length, 1);
  const parent = menu.items[0];
  assert.equal(parent.title, "AnimeList");
  assert.ok(parent.submenu);
  assert.equal(parent.submenu?.items.length, 1);
  const child = parent.submenu?.items[0];
  assert.equal(child?.title, "Add image section");
  child?.click?.();
  assert.equal(inserted.length, 1);
  assert.match(inserted[0], /```animelist-images/);
});
