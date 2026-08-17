import { Menu, setIcon } from "obsidian";
import type { LibrarySection } from "../domain/settings-types";
import { uiText } from "../ui-text";
import type { WorkspaceMenuAction, WorkspacePageDefinition } from "./workspace-contracts";
import { makeEl, setAnimeListIcon } from "./ui-helpers";

export interface WorkspaceShellOptions {
  pages: readonly WorkspacePageDefinition[];
  activeSection: LibrarySection;
  actions?: readonly WorkspaceMenuAction[];
  onSelect(section: LibrarySection): void | Promise<void>;
  onCollect(): void;
}

export interface WorkspaceShellResult {
  page: HTMLElement;
  activePage: WorkspacePageDefinition;
}

function orderedPages(pages: readonly WorkspacePageDefinition[]): WorkspacePageDefinition[] {
  return [...pages].sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
}

function orderedActions(actions: readonly WorkspaceMenuAction[]): WorkspaceMenuAction[] {
  return [...actions].sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
}

export function renderAnimeListWorkspaceShell(
  container: HTMLElement,
  options: WorkspaceShellOptions,
): WorkspaceShellResult {
  container.replaceChildren();
  const pages = orderedPages(options.pages);
  const activePage = pages.find((page) => page.id === options.activeSection) ?? pages[0];
  if (!activePage) throw new Error("AnimeList workspace requires at least one page");

  const shell = makeEl("section", `al-workspace-shell is-${activePage.id}`);
  const header = makeEl("header", "al-workspace-header");
  const brand = makeEl("div", "al-workspace-brand");
  brand.appendChild(makeEl("strong", "al-workspace-title", "AnimeList"));

  const actions = makeEl("div", "al-workspace-header-actions");
  const collect = makeEl("button", "al-add-button al-workspace-collect");
  collect.type = "button";
  setAnimeListIcon(collect, "plus");
  collect.appendChild(makeEl("span", "", uiText("action.collect")));
  collect.addEventListener("click", () => options.onCollect());
  actions.appendChild(collect);

  const menuActions = orderedActions(options.actions ?? []);
  if (menuActions.length) {
    const more = makeEl("button", "al-workspace-more");
    more.type = "button";
    const moreLabel = uiText("detail.more");
    more.title = moreLabel;
    more.setAttribute("aria-label", moreLabel);
    setAnimeListIcon(more, "ellipsis");
    more.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = new Menu();
      for (const action of menuActions) {
        menu.addItem((item) => {
          item.setTitle(action.label);
          if (action.icon) item.setIcon(action.icon);
          item.onClick(() => { void action.run(); });
        });
      }
      menu.showAtMouseEvent(event);
    });
    actions.appendChild(more);
  }
  header.appendChild(brand);

  const navRow = makeEl("div", "al-workspace-nav-row");
  const nav = makeEl("nav", "al-workspace-nav");
  nav.setAttribute("aria-label", "Primary navigation");
  for (const page of pages) {
    const button = makeEl("button", `al-workspace-tab${page.id === activePage.id ? " is-active" : ""}`);
    button.type = "button";
    button.dataset.section = page.id;
    if (page.id === activePage.id) button.setAttribute("aria-current", "page");
    const icon = makeEl("span", "al-workspace-tab-icon");
    setIcon(icon, page.icon);
    button.append(icon, makeEl("span", "al-workspace-tab-label", page.label));
    button.addEventListener("click", () => {
      if (page.id === activePage.id) return;
      void options.onSelect(page.id);
    });
    nav.appendChild(button);
  }

  navRow.append(nav, actions);

  const page = makeEl("div", `al-workspace-page is-${activePage.id}`);
  shell.append(header, navRow, page);
  container.appendChild(shell);
  return { page, activePage };
}
