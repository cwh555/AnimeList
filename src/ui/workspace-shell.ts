import { Menu, setIcon } from "obsidian";
import type { LibrarySection } from "../domain/settings-types";
import { uiText } from "../ui-text";
import type { WorkspaceMenuAction, WorkspacePageDefinition } from "./workspace-contracts";
import { appendIconLabel, makeEl, setAnimeListIcon } from "./ui-helpers";
import { isolateHorizontalSwipeSurface } from "./mobile-swipe-isolation";
import { disconnectWorkspaceWindowSize, observeWorkspaceWindowSize } from "./workspace-responsive";

export interface WorkspaceShellOptions {
  pages: readonly WorkspacePageDefinition[];
  activeSection: LibrarySection;
  actions?: readonly WorkspaceMenuAction[];
  onSelect(section: LibrarySection): void | Promise<void>;
}

export interface WorkspaceShellResult {
  page: HTMLElement;
  pageActions: HTMLElement;
  activePage: WorkspacePageDefinition;
}

const MAX_DIRECT_WORKSPACE_ACTIONS = 2;

function orderedPages(pages: readonly WorkspacePageDefinition[]): WorkspacePageDefinition[] {
  return [...pages].sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
}

function orderedActions(actions: readonly WorkspaceMenuAction[]): WorkspaceMenuAction[] {
  return [...actions].sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
}

interface WorkspaceShellCacheEntry {
  signature: string;
  shell: HTMLElement;
  page: HTMLElement;
  pageActions: HTMLElement;
  state: { options: WorkspaceShellOptions };
}

const workspaceShellCache = new WeakMap<HTMLElement, WorkspaceShellCacheEntry>();

function shellSignature(
  activePage: WorkspacePageDefinition,
  pages: readonly WorkspacePageDefinition[],
  actions: readonly WorkspaceMenuAction[],
): string {
  return JSON.stringify({
    active: activePage.id,
    pages: pages.map((page) => [page.id, page.label, page.icon, page.order]),
    actions: actions.map((action) => [action.id, action.label, action.icon ?? "", action.order]),
  });
}

function appendDirectAction(
  parent: HTMLElement,
  action: WorkspaceMenuAction,
  state: { options: WorkspaceShellOptions },
): void {
  const direct = makeEl("button", "al-secondary-button al-workspace-action");
  direct.type = "button";
  direct.title = action.label;
  direct.dataset.actionId = action.id;
  if (action.icon) appendIconLabel(direct, action.icon, action.label);
  else direct.textContent = action.label;
  direct.addEventListener("click", () => {
    const current = state.options.actions?.find((candidate) => candidate.id === action.id);
    if (current) void current.run();
  });
  parent.appendChild(direct);
}

function appendOverflowActions(
  parent: HTMLElement,
  overflowActions: readonly WorkspaceMenuAction[],
  state: { options: WorkspaceShellOptions },
): void {
  if (!overflowActions.length) return;
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
    for (const action of overflowActions) {
      menu.addItem((item) => {
        item.setTitle(action.label);
        if (action.icon) item.setIcon(action.icon);
        item.onClick(() => {
          const current = state.options.actions?.find((candidate) => candidate.id === action.id);
          if (current) void current.run();
        });
      });
    }
    menu.showAtMouseEvent(event);
  });
  parent.appendChild(more);
}

export function renderAnimeListWorkspaceShell(
  container: HTMLElement,
  options: WorkspaceShellOptions,
): WorkspaceShellResult {
  const pages = orderedPages(options.pages);
  const activePage = pages.find((page) => page.id === options.activeSection) ?? pages[0];
  if (!activePage) throw new Error("AnimeList workspace requires at least one page");
  const menuActions = orderedActions(options.actions ?? []);
  const signature = shellSignature(activePage, pages, menuActions);
  const cached = workspaceShellCache.get(container);
  if (cached?.signature === signature && cached.shell.isConnected && cached.page.isConnected) {
    cached.state.options = options;
    container.classList.toggle("is-timeline-workspace", activePage.id === "timeline");
    return { page: cached.page, pageActions: cached.pageActions, activePage };
  }

  disconnectWorkspaceWindowSize(container);
  container.replaceChildren();
  container.classList.toggle("is-timeline-workspace", activePage.id === "timeline");
  const state = { options };

  const shell = makeEl("section", `al-workspace-shell is-${activePage.id}`);
  const header = makeEl("header", "al-workspace-header");
  const brand = makeEl("div", "al-workspace-brand");
  brand.appendChild(makeEl("strong", "al-workspace-title", "AnimeList"));

  const actions = makeEl("div", "al-workspace-header-actions");
  const directActions = menuActions.slice(0, MAX_DIRECT_WORKSPACE_ACTIONS);
  const overflowActions = menuActions.slice(MAX_DIRECT_WORKSPACE_ACTIONS);
  for (const action of directActions) appendDirectAction(actions, action, state);
  appendOverflowActions(actions, overflowActions, state);
  header.append(brand, actions);

  const navRow = makeEl("div", "al-workspace-nav-row");
  const nav = isolateHorizontalSwipeSurface(makeEl("nav", "al-workspace-nav"));
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
      void state.options.onSelect(page.id);
    });
    nav.appendChild(button);
  }
  navRow.appendChild(nav);

  const page = makeEl("section", `al-workspace-page is-${activePage.id}`);
  const pageHeader = makeEl("header", "al-workspace-page-header");
  const pageHeading = makeEl("div", "al-workspace-page-heading");
  pageHeading.appendChild(makeEl("h1", "al-workspace-page-title", activePage.label));
  const pageActions = makeEl("div", "al-workspace-page-actions");
  pageHeader.append(pageHeading, pageActions);
  const pageBody = makeEl("div", "al-workspace-page-body");
  page.append(pageHeader, pageBody);

  shell.append(header, navRow, page);
  container.appendChild(shell);
  observeWorkspaceWindowSize(container, shell);
  workspaceShellCache.set(container, { signature, shell, page: pageBody, pageActions, state });
  return { page: pageBody, pageActions, activePage };
}
