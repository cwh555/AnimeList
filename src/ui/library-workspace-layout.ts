import { makeEl } from "./ui-helpers";

interface WorkspaceLayoutNodes {
  shell: HTMLElement;
  page: HTMLElement;
  pageActions: HTMLElement;
  summary: HTMLElement;
  collect: HTMLElement | null;
  typeTabs: HTMLElement;
  toolbar: HTMLElement;
  queryTools: HTMLElement;
  displayTools: HTMLElement;
}

function restructure(container: HTMLElement): WorkspaceLayoutNodes | null {
  if (typeof container.closest !== "function") return null;
  const page = container.closest<HTMLElement>(".al-workspace-page.is-library");
  const pageActions = page?.querySelector<HTMLElement>(":scope > .al-workspace-page-header > .al-workspace-page-actions");
  const shell = container.querySelector<HTMLElement>(":scope > .al-shell.is-workspace-page");
  const summary = shell?.querySelector<HTMLElement>(":scope > .al-library-workspace-summary");
  const typeRow = shell?.querySelector<HTMLElement>(":scope > .al-library-workspace-type-row");
  const typeTabs = typeRow?.querySelector<HTMLElement>(":scope > .al-type-tabs")
    ?? shell?.querySelector<HTMLElement>(":scope > .al-type-tabs");
  const collect = typeRow?.querySelector<HTMLElement>(":scope > .al-library-workspace-collect")
    ?? summary?.querySelector<HTMLElement>(":scope > .al-library-workspace-collect")
    ?? pageActions?.querySelector<HTMLElement>(":scope > .al-library-workspace-collect")
    ?? null;
  const toolbar = shell?.querySelector<HTMLElement>(":scope > .al-toolbar");
  const search = toolbar?.querySelector<HTMLElement>(":scope > .al-search")
    ?? toolbar?.querySelector<HTMLElement>(".al-search");
  const filter = toolbar?.querySelector<HTMLElement>(":scope > .al-filter-button")
    ?? toolbar?.querySelector<HTMLElement>(".al-filter-button");
  const sort = toolbar?.querySelector<HTMLElement>(":scope > .al-sort")
    ?? toolbar?.querySelector<HTMLElement>(".al-sort");
  const viewSwitch = toolbar?.querySelector<HTMLElement>(":scope > .al-view-switch")
    ?? toolbar?.querySelector<HTMLElement>(".al-view-switch");
  if (!page || !pageActions || !shell || !summary || !typeTabs || !toolbar || !search || !filter || !sort || !viewSwitch) {
    return null;
  }

  summary.querySelector<HTMLElement>(":scope > strong")?.remove();
  summary.classList.add("al-workspace-page-meta");

  if (collect && collect.parentElement !== pageActions) pageActions.appendChild(collect);

  typeTabs.classList.add("al-library-workspace-type-tabs");
  if (typeRow) {
    shell.insertBefore(typeTabs, typeRow);
    typeRow.remove();
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

  return { shell, page, pageActions, summary, collect, typeTabs, toolbar, queryTools, displayTools };
}

export function installLibraryWorkspaceLayout(container: HTMLElement): void {
  restructure(container);
}
