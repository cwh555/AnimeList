import assert from "node:assert/strict";
import test from "node:test";
import { Menu, type Editor } from "obsidian";
import { imageSectionInsertionPlan } from "../src/domain/image-section";
import { momentsInsertionPlan } from "../src/domain/moments";
import { renderAnimeListInsertMenu } from "../src/media-note-insert-menu";

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

test("AnimeList editor menu uses one native submenu for moments and image sections", () => {
  const { editor, inserted } = editorHarness();
  const menu = new Menu();
  renderAnimeListInsertMenu(menu, editor, [
    {
      id: "image",
      title: "Add image section",
      icon: "images",
      order: 20,
      insert(target) {
        const cursor = target.getCursor("to");
        const plan = imageSectionInsertionPlan(cursor.line, target.getLine(cursor.line));
        target.replaceRange(plan.text, plan.at);
      },
    },
    {
      id: "moments",
      title: "Add moments section",
      icon: "quote",
      order: 10,
      insert(target) {
        const cursor = target.getCursor("to");
        const plan = momentsInsertionPlan(cursor.line, target.getLine(cursor.line));
        target.replaceRange(plan.text, plan.at);
      },
    },
  ]);

  assert.equal(menu.items.length, 1);
  const parent = menu.items[0];
  assert.equal(parent.title, "AnimeList");
  assert.ok(parent.submenu);
  assert.deepEqual(parent.submenu?.items.map((item) => item.title), ["Add moments section", "Add image section"]);
  parent.submenu?.items[0].click?.();
  parent.submenu?.items[1].click?.();
  assert.match(inserted[0], /```animelist-moments\nmoments: \[\]/);
  assert.match(inserted[1], /```animelist-images/);
});
