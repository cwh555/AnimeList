import type { MediaType } from "../domain/media-types";
import type { LibraryMediaFilter } from "./library-contracts";
import { uiText } from "../ui-text";
import { appendIconLabel, makeEl } from "./ui-helpers";

/**
 * Re-arrange Library-owned controls inside the Library page body.
 *
 * This helper intentionally never moves nodes into the shared Workspace header.
 * Cross-boundary page actions are passed through the explicit Workspace action
 * slot instead, so a Library re-render cannot leak detached controls into the
 * persistent shell.
 */
export function installLibraryWorkspaceLayout(container: HTMLElement): void {
  const shell = container.querySelector<HTMLElement>(":scope > .al-shell.is-workspace-page");
  const summary = shell?.querySelector<HTMLElement>(":scope > .al-library-workspace-summary");
  const typeRow = shell?.querySelector<HTMLElement>(":scope > .al-library-workspace-type-row");
  const typeTabs = typeRow?.querySelector<HTMLElement>(":scope > .al-type-tabs")
    ?? shell?.querySelector<HTMLElement>(":scope > .al-type-tabs");
  const toolbar = shell?.querySelector<HTMLElement>(":scope > .al-toolbar");
  const search = toolbar?.querySelector<HTMLElement>(":scope > .al-search")
    ?? toolbar?.querySelector<HTMLElement>(".al-search");
  const filter = toolbar?.querySelector<HTMLElement>(":scope > .al-filter-button")
    ?? toolbar?.querySelector<HTMLElement>(".al-filter-button");
  const sort = toolbar?.querySelector<HTMLElement>(":scope > .al-sort")
    ?? toolbar?.querySelector<HTMLElement>(".al-sort");
  const viewSwitch = toolbar?.querySelector<HTMLElement>(":scope > .al-view-switch")
    ?? toolbar?.querySelector<HTMLElement>(".al-view-switch");
  if (!shell || !summary || !typeTabs || !toolbar || !search || !filter || !sort || !viewSwitch) return;

  summary.querySelector<HTMLElement>(":scope > strong")?.remove();
  summary.classList.add("al-workspace-page-meta");

  typeTabs.classList.add("al-library-workspace-type-tabs");
  if (typeRow) {
    shell.insertBefore(typeTabs, typeRow);
    if (typeRow.childElementCount === 0) typeRow.remove();
  }

  toolbar.classList.add("al-library-workspace-toolbar");
  let queryTools = toolbar.querySelector<HTMLElement>(":scope > .al-library-workspace-query-tools");
  let displayTools = toolbar.querySelector<HTMLElement>(":scope > .al-library-workspace-display-tools");
  if (!queryTools) {
    queryTools = makeEl("div", "al-library-workspace-query-tools");
    queryTools.append(search, filter, sort);
    toolbar.prepend(queryTools);
  }
  if (!displayTools) {
    displayTools = makeEl("div", "al-library-workspace-display-tools");
    displayTools.appendChild(viewSwitch);
    toolbar.appendChild(displayTools);
  }
}

export interface LibraryWorkspaceActionOptions {
  currentType(): LibraryMediaFilter;
  addItem(mediaType: MediaType): void;
}

interface LibraryWorkspaceActionState {
  options: LibraryWorkspaceActionOptions;
  collect: HTMLButtonElement;
}

const libraryWorkspaceActions = new WeakMap<HTMLElement, LibraryWorkspaceActionState>();

/**
 * Reconcile Library page actions inside the Workspace-owned header slot.
 *
 * The slot itself survives same-page refreshes, so keep its action node stable as
 * well. The listener reads the latest options from state instead of closing over
 * one render, preventing both duplicate listeners and header-button flicker.
 */
export function renderLibraryWorkspaceActions(
  pageActions: HTMLElement,
  options: LibraryWorkspaceActionOptions,
): void {
  const existing = libraryWorkspaceActions.get(pageActions);
  if (existing) {
    existing.options = options;
    if (pageActions.childElementCount !== 1 || pageActions.firstElementChild !== existing.collect) {
      pageActions.replaceChildren(existing.collect);
    }
    return;
  }

  const collect = makeEl("button", "al-add-button al-library-workspace-collect");
  collect.type = "button";
  appendIconLabel(collect, "plus", uiText("action.collect"));
  const state: LibraryWorkspaceActionState = { options, collect };
  collect.addEventListener("click", () => {
    const type = state.options.currentType();
    state.options.addItem(type === "all" ? "anime" : type);
  });
  libraryWorkspaceActions.set(pageActions, state);
  pageActions.replaceChildren(collect);
}
