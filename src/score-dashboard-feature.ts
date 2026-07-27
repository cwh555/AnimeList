import { Notice, TFile, setIcon, type Plugin, type WorkspaceLeaf } from "obsidian";
import type { AnimeListPluginHost } from "./app/plugin-host";
import { applyScoreDashboardChanges } from "./score-dashboard-score-service";
import { confirmScoreDashboardClamp } from "./score-dashboard-operation-ui";
import { ScoreDashboardRefreshGuard } from "./score-dashboard-refresh";
import { scoreDashboardText as text } from "./score-dashboard-text";
import {
  SCORE_DASHBOARD_VIEW_TYPE,
  ScoreDashboardView,
  type ScoreDashboardPluginHost,
} from "./score-dashboard-view";

interface ScoreDashboardPluginMethods extends AnimeListPluginHost {
  collectMediaItems(): ReturnType<ScoreDashboardPluginHost["collectMediaItems"]>;
  openMediaFile(path: string): Promise<void>;
}

type ScoreDashboardPlugin = ScoreDashboardPluginMethods & Pick<
  Plugin,
  "registerView" | "addCommand" | "registerEvent"
>;

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
  const refreshGuard = new ScoreDashboardRefreshGuard();
  const host = createHost(plugin, refreshGuard);
  const open = (): void => { void openScoreDashboard(plugin); };

  plugin.features.registerLibrary({
    id: "score-dashboard-button",
    order: 30,
    renderToolbarAction: ({ actions, addButton }) => {
      const button = actions.createEl("button", {
        cls: "al-secondary-button al-score-dashboard-button",
      });
      button.type = "button";
      button.title = text.open;
      button.setAttribute("aria-label", text.open);
      setIcon(button, "table-properties");
      button.createSpan({ text: text.title });
      button.addEventListener("click", open);
      actions.insertBefore(button, addButton);
    },
  });

  plugin.registerView(SCORE_DASHBOARD_VIEW_TYPE, (leaf) => new ScoreDashboardView(leaf, host));
  plugin.addCommand({ id: "open-score-dashboard", name: text.open, callback: open });
  const refresh = (): void => plugin.app.workspace.getLeavesOfType(SCORE_DASHBOARD_VIEW_TYPE).forEach((leaf: WorkspaceLeaf) => {
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
