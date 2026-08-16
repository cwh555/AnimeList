import { Menu, type Editor, type MenuItem } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";

const MENU_TITLE = "AnimeList";

type MenuItemWithSubmenu = MenuItem & { setSubmenu?: () => Menu };

export interface MediaNoteInsertAction {
  id: string;
  title: string;
  icon: string;
  order?: number;
  insert(editor: Editor): void;
}

function isMediaNote(frontmatter: Record<string, unknown> | undefined): boolean {
  return frontmatter?.media_type === "anime"
    || frontmatter?.media_type === "manga"
    || frontmatter?.media_type === "novel";
}

function configureItem(item: MenuItem, action: MediaNoteInsertAction, editor: Editor): void {
  item.setTitle(action.title).setIcon(action.icon).onClick(() => action.insert(editor));
}

export function renderAnimeListInsertMenu(
  menu: Menu,
  editor: Editor,
  actions: readonly MediaNoteInsertAction[],
): void {
  const ordered = [...actions].sort((left, right) => (left.order ?? 100) - (right.order ?? 100) || left.title.localeCompare(right.title));
  if (!ordered.length) return;
  menu.addItem((item) => {
    item.setTitle(MENU_TITLE).setIcon("list-tree").setSection("animelist");
    const submenuItem = item as MenuItemWithSubmenu;
    if (typeof submenuItem.setSubmenu === "function") {
      const submenu = submenuItem.setSubmenu();
      for (const action of ordered) submenu.addItem((child) => configureItem(child, action, editor));
      return;
    }
    configureItem(item, { ...ordered[0], title: `${MENU_TITLE}: ${ordered[0].title}` }, editor);
    for (const action of ordered.slice(1)) {
      menu.addItem((fallback) => configureItem(fallback, { ...action, title: `${MENU_TITLE}: ${action.title}` }, editor));
    }
  });
}

const actionsByHost = new WeakMap<AnimeListFeatureHost, Map<string, MediaNoteInsertAction>>();
const installedHosts = new WeakSet<AnimeListFeatureHost>();

export function registerMediaNoteInsertAction(host: AnimeListFeatureHost, action: MediaNoteInsertAction): void {
  let actions = actionsByHost.get(host);
  if (!actions) {
    actions = new Map();
    actionsByHost.set(host, actions);
  }
  actions.set(action.id, action);
  if (installedHosts.has(host)) return;
  installedHosts.add(host);
  host.registerEvent(host.app.workspace.on("editor-menu", (menu, editor, info) => {
    const file = info.file;
    if (!file) return;
    const frontmatter = host.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!isMediaNote(frontmatter)) return;
    renderAnimeListInsertMenu(menu, editor, [...(actionsByHost.get(host)?.values() ?? [])]);
  }));
}
