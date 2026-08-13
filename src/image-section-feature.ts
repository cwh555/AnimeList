import { Menu, type Editor, type MenuItem } from "obsidian";
import type { AnimeListFeature, AnimeListFeatureHost } from "./app/feature-types";
import { ImageSectionService } from "./data/image-section-service";
import { IMAGE_SECTION_LANGUAGE, imageSectionInsertionPlan } from "./domain/image-section";
import { ImageSectionRenderChild } from "./ui/image-section-renderer";

const CONTEXT_MENU_TITLE = "AnimeList";
const CONTEXT_MENU_INSERT = "Add image section";

type MenuItemWithSubmenu = MenuItem & { setSubmenu?: () => Menu };

function isMediaNote(frontmatter: Record<string, unknown> | undefined): boolean {
  return frontmatter?.media_type === "anime"
    || frontmatter?.media_type === "manga"
    || frontmatter?.media_type === "novel";
}

function insertImageSection(editor: Editor): void {
  const cursor = editor.getCursor("to");
  const plan = imageSectionInsertionPlan(cursor.line, editor.getLine(cursor.line));
  editor.replaceRange(plan.text, plan.at);
  editor.setCursor(plan.cursor);
}

function configureInsertItem(item: MenuItem, editor: Editor): void {
  item
    .setTitle(CONTEXT_MENU_INSERT)
    .setIcon("images")
    .onClick(() => insertImageSection(editor));
}

export function addImageSectionContextMenu(menu: Menu, editor: Editor): void {
  menu.addItem((item) => {
    item.setTitle(CONTEXT_MENU_TITLE).setIcon("list-tree").setSection("animelist");
    const submenuItem = item as MenuItemWithSubmenu;
    if (typeof submenuItem.setSubmenu === "function") {
      const submenu: Menu = submenuItem.setSubmenu();
      submenu.addItem((child: MenuItem) => configureInsertItem(child, editor));
      return;
    }

    // Safe fallback if a future Obsidian build removes the native submenu helper.
    item.setTitle(`${CONTEXT_MENU_TITLE}: ${CONTEXT_MENU_INSERT}`).onClick(() => insertImageSection(editor));
  });
}

export const imageSectionFeature: AnimeListFeature<AnimeListFeatureHost> = {
  id: "image-sections",
  contributions: [{
    kind: "lifecycle",
    activate(host) {
      const service = new ImageSectionService(host);
      host.registerMarkdownCodeBlockProcessor(IMAGE_SECTION_LANGUAGE, (source, element, context) => {
        context.addChild(new ImageSectionRenderChild(element, host, service, source, context));
      });

      host.registerEvent(host.app.workspace.on("editor-menu", (menu, editor, info) => {
        const file = info.file;
        if (!file) return;
        const frontmatter = host.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!isMediaNote(frontmatter)) return;
        addImageSectionContextMenu(menu, editor);
      }));
    },
  }],
};
