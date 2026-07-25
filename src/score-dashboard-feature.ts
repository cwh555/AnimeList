import { setIcon, type Plugin, type WorkspaceLeaf } from "obsidian";
import { AnimeListUI } from "./legacy";
import { scoreDashboardText as text } from "./score-dashboard-text";
import { SCORE_DASHBOARD_VIEW_TYPE, ScoreDashboardView, type ScoreDashboardPluginHost } from "./score-dashboard-view";

type ScoreDashboardPlugin = ScoreDashboardPluginHost & Pick<
  Plugin,
  "app" | "registerView" | "addCommand" | "registerEvent"
>;

let libraryUiInstalled = false;
let openDashboard: (() => void) | null = null;

function installLibraryButton(): void {
  if (libraryUiInstalled) return;
  libraryUiInstalled = true;
  const original = AnimeListUI.renderLibrary.bind(AnimeListUI);
  AnimeListUI.renderLibrary = (container: HTMLElement, items: unknown[], adapters: Record<string, unknown> = {}) => {
    const result = original(container, items, adapters);
    const actions = container.querySelector<HTMLElement>(".al-hero-actions");
    if (!actions || actions.querySelector(".al-score-dashboard-button")) return result;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "al-secondary-button al-score-dashboard-button";
    button.title = text.open;
    button.setAttribute("aria-label", text.open);
    setIcon(button, "table-properties");
    const label = document.createElement("span");
    label.textContent = text.title;
    button.appendChild(label);
    button.addEventListener("click", () => openDashboard?.());
    const addButton = actions.querySelector(".al-add-button");
    actions.insertBefore(button, addButton);
    return result;
  };
}

export function installScoreDashboard(plugin: ScoreDashboardPlugin): void {
  installLibraryButton();
  openDashboard = () => void openScoreDashboard(plugin);
  plugin.registerView(SCORE_DASHBOARD_VIEW_TYPE, (leaf) => new ScoreDashboardView(leaf, plugin));
  plugin.addCommand({ id: "open-score-dashboard", name: text.open, callback: () => void openScoreDashboard(plugin) });
  const refresh = () => plugin.app.workspace.getLeavesOfType(SCORE_DASHBOARD_VIEW_TYPE).forEach((leaf: WorkspaceLeaf) => {
    if (leaf.view instanceof ScoreDashboardView) leaf.view.scheduleRender();
  });
  plugin.registerEvent(plugin.app.metadataCache.on("changed", refresh));
  plugin.registerEvent(plugin.app.vault.on("create", refresh));
  plugin.registerEvent(plugin.app.vault.on("delete", refresh));
  plugin.registerEvent(plugin.app.vault.on("rename", refresh));
}

export async function openScoreDashboard(plugin: ScoreDashboardPlugin): Promise<void> {
  let leaf = plugin.app.workspace.getLeavesOfType(SCORE_DASHBOARD_VIEW_TYPE)[0];
  if (!leaf) {
    leaf = plugin.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: SCORE_DASHBOARD_VIEW_TYPE, active: true });
  }
  plugin.app.workspace.revealLeaf(leaf);
}
