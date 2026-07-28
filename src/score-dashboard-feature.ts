import { Notice, TFile, setIcon, type WorkspaceLeaf } from "obsidian";
import { defineFeature, type AnimeListFeatureHost } from "./app/feature-types";
import { ScoreDashboardDragAutoScroller } from "./score-dashboard-drag-scroll";
import { applyScoreDashboardChanges } from "./score-dashboard-score-service";
import { confirmScoreDashboardClamp } from "./score-dashboard-operation-ui";
import { ScoreDashboardRefreshGuard } from "./score-dashboard-refresh";
import { scoreDashboardText as text } from "./score-dashboard-text";
import {
  SCORE_DASHBOARD_VIEW_TYPE,
  ScoreDashboardView,
  type ScoreDashboardPluginHost,
} from "./score-dashboard-view";

interface ScoreDashboardDomEventRegistrar {
  registerDomEvent?<K extends keyof DocumentEventMap>(
    element: Document,
    type: K,
    callback: (event: DocumentEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  registerDomEvent?<K extends keyof WindowEventMap>(
    element: Window,
    type: K,
    callback: (event: WindowEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

type ScoreDashboardPlugin = AnimeListFeatureHost & ScoreDashboardDomEventRegistrar;

const OPENERS = new WeakMap<object, () => void>();

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

function installDragAutoScroll(plugin: ScoreDashboardPlugin): void {
  if (!plugin.registerDomEvent) return;
  let scroller: ScoreDashboardDragAutoScroller | null = null;
  const stop = (): void => {
    scroller?.stop();
    scroller = null;
  };
  plugin.registerDomEvent(document, "dragstart", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const poster = target.closest<HTMLButtonElement>(".al-score-poster");
    const scrollContainer = poster?.closest<HTMLElement>(".animelist-score-dashboard-view");
    if (!poster || !scrollContainer || !poster.draggable) return;
    stop();
    scroller = new ScoreDashboardDragAutoScroller(scrollContainer);
    scroller.start();
  });
  plugin.registerDomEvent(document, "dragover", (event) => scroller?.update(event.clientY));
  plugin.registerDomEvent(document, "drop", stop);
  plugin.registerDomEvent(document, "dragend", stop);
  plugin.registerDomEvent(window, "blur", stop);
}

async function openScoreDashboard(plugin: ScoreDashboardPlugin): Promise<void> {
  let leaf = plugin.app.workspace.getLeavesOfType(SCORE_DASHBOARD_VIEW_TYPE)[0];
  if (!leaf) {
    leaf = plugin.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: SCORE_DASHBOARD_VIEW_TYPE, active: true });
  }
  plugin.app.workspace.revealLeaf(leaf);
}

function activateDashboard(plugin: ScoreDashboardPlugin): void {
  const refreshGuard = new ScoreDashboardRefreshGuard();
  const host = createHost(plugin, refreshGuard);
  const open = () => void openScoreDashboard(plugin);
  OPENERS.set(plugin, open);
  plugin.registerView(SCORE_DASHBOARD_VIEW_TYPE, (leaf) => new ScoreDashboardView(leaf, host));
  plugin.addCommand({ id: "open-score-dashboard", name: text.open, callback: open });
  const refresh = () => plugin.app.workspace.getLeavesOfType(SCORE_DASHBOARD_VIEW_TYPE).forEach((leaf: WorkspaceLeaf) => {
    if (leaf.view instanceof ScoreDashboardView) leaf.view.scheduleRender();
  });
  plugin.registerEvent(plugin.app.metadataCache.on("changed", (file) => {
    if (!(file instanceof TFile) || !refreshGuard.shouldSuppress(file.path)) refresh();
  }));
  plugin.registerEvent(plugin.app.vault.on("create", refresh));
  plugin.registerEvent(plugin.app.vault.on("delete", refresh));
  plugin.registerEvent(plugin.app.vault.on("rename", refresh));
  installDragAutoScroll(plugin);
}

export const scoreDashboardFeature = defineFeature<AnimeListFeatureHost>({
  id: "score-dashboard",
  contributions: [{
    kind: "lifecycle",
    activate: activateDashboard,
  }, {
    kind: "library",
    afterRender({ host, container }): void {
      const actions = container.querySelector<HTMLElement>(".al-hero-actions");
      if (!actions || actions.querySelector(".al-score-dashboard-button")) return;
      const button = actions.createEl("button", {
        cls: "al-secondary-button al-score-dashboard-button",
      });
      button.type = "button";
      button.title = text.open;
      button.setAttribute("aria-label", text.open);
      setIcon(button, "table-properties");
      button.createSpan({ text: text.title });
      button.addEventListener("click", () => OPENERS.get(host)?.());
      actions.insertBefore(button, actions.querySelector(".al-add-button"));
    },
  }],
});
