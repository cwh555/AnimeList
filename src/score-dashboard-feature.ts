import { Notice, TFile, setIcon, type Plugin, type WorkspaceLeaf } from "obsidian";
import { AnimeListUI } from "./legacy";
import { applyScoreDashboardChanges } from "./score-dashboard-score-service";
import { confirmScoreDashboardClamp } from "./score-dashboard-operation-ui";
import { ScoreDashboardRefreshGuard } from "./score-dashboard-refresh";
import { scoreDashboardText as text } from "./score-dashboard-text";
import { SCORE_DASHBOARD_VIEW_TYPE, ScoreDashboardView, type ScoreDashboardPluginHost } from "./score-dashboard-view";

interface ScoreDashboardPluginMethods {
  collectMediaItems(): ReturnType<ScoreDashboardPluginHost["collectMediaItems"]>;
  openMediaFile(path: string): Promise<void>;
}

type ScoreDashboardPlugin = ScoreDashboardPluginMethods & Pick<
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

function createHost(
  plugin: ScoreDashboardPlugin,
  refreshGuard: ScoreDashboardRefreshGuard,
): ScoreDashboardPluginHost {
  return {
    collectMediaItems: () => plugin.collectMediaItems(),
    openMediaFile: (path) => plugin.openMediaFile(path),
    applyScoreChanges: async (changes) => {
      const paths = changes.map((change) => change.filePath);
      refreshGuard.mark(paths);
      try {
        await applyScoreDashboardChanges(plugin.app, changes);
      } catch (error) {
        refreshGuard.release(paths);
        throw error;
      }
    },
    confirmScoreClamp: (summary) => confirmScoreDashboardClamp(plugin.app, summary),
    showNotice: (message) => { new Notice(message); },
  };
}

export function installScoreDashboard(plugin: ScoreDashboardPlugin): void {
  installLibraryButton();
  const refreshGuard = new ScoreDashboardRefreshGuard();
  const host = createHost(plugin, refreshGuard);
  openDashboard = () => void openScoreDashboard(plugin);
  plugin.registerView(SCORE_DASHBOARD_VIEW_TYPE, (leaf) => new ScoreDashboardView(leaf, host));
  plugin.addCommand({ id: "open-score-dashboard", name: text.open, callback: () => void openScoreDashboard(plugin) });
  const refresh = () => plugin.app.workspace.getLeavesOfType(SCORE_DASHBOARD_VIEW_TYPE).forEach((leaf: WorkspaceLeaf) => {
    if (leaf.view instanceof ScoreDashboardView) leaf.view.scheduleRender();
  });
  plugin.registerEvent(plugin.app.metadataCache.on("changed", (file) => {
    if (!(file instanceof TFile) || !refreshGuard.shouldSuppress(file.path)) refresh();
  }));
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
