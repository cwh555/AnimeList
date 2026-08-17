import { Notice, TAbstractFile, TFile, type WorkspaceLeaf } from "obsidian";
import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { ScoreDashboardRefreshGuard, shouldRefreshScoreDashboardMetadata, shouldRefreshScoreDashboardPath, shouldRefreshScoreDashboardRename } from "../../app/score-dashboard/refresh";
import { applyScoreDashboardChanges } from "../../data/score-dashboard/score-service";
import { ScoreDashboardDragAutoScroller } from "../../domain/score-dashboard/drag-scroll";
import { SCORE_DASHBOARD_DEFAULT_SCALE } from "../../domain/score-dashboard/model";
import { renderScoreDashboardWithBatchDrag } from "../../ui/score-dashboard/batch-drag";
import { prepareScoreDashboardCoverSources } from "../../ui/score-dashboard/cover-sources";
import { confirmScoreDashboardClamp } from "../../ui/score-dashboard/operation-ui";
import type { ScoreDashboardUiState } from "../../ui/score-dashboard/renderer";
import { SCORE_DASHBOARD_VIEW_TYPE, ScoreDashboardView, type ScoreDashboardPluginHost } from "../../ui/score-dashboard/view";
import { scoreDashboardText as text } from "./text";

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

const HOSTS = new WeakMap<object, ScoreDashboardPluginHost>();
const STATES = new WeakMap<object, ScoreDashboardUiState>();

function createHost(
  plugin: ScoreDashboardPlugin,
  refreshGuard: ScoreDashboardRefreshGuard,
): ScoreDashboardPluginHost {
  return {
    collectMediaItems: () => prepareScoreDashboardCoverSources(plugin.collectMediaItems()),
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

function activateDashboard(plugin: ScoreDashboardPlugin): void {
  const refreshGuard = new ScoreDashboardRefreshGuard();
  const dashboardHost = createHost(plugin, refreshGuard);
  HOSTS.set(plugin, dashboardHost);

  // Keep the old view type registered so restored workspaces from earlier versions remain valid.
  plugin.registerView(SCORE_DASHBOARD_VIEW_TYPE, (leaf) => new ScoreDashboardView(leaf, dashboardHost));
  plugin.addCommand({
    id: "open-score-dashboard",
    name: text.open,
    callback: () => { void plugin.openLibrarySection("scores"); },
  });

  const refresh = () => {
    plugin.refreshViews();
    plugin.app.workspace.getLeavesOfType(SCORE_DASHBOARD_VIEW_TYPE).forEach((leaf: WorkspaceLeaf) => {
      if (leaf.view instanceof ScoreDashboardView) leaf.view.scheduleRender();
    });
  };
  const scanRoots = () => plugin.getScanFolders();
  const coverFolder = () => plugin.settings.coverFolder;
  plugin.registerEvent(plugin.app.metadataCache.on("changed", (file) => {
    if (file instanceof TFile && shouldRefreshScoreDashboardMetadata(
      file.path, scanRoots(), coverFolder(), refreshGuard,
    )) refresh();
  }));
  plugin.registerEvent(plugin.app.vault.on("create", (file) => {
    if (file instanceof TAbstractFile
      && shouldRefreshScoreDashboardPath(file.path, scanRoots(), coverFolder())) refresh();
  }));
  plugin.registerEvent(plugin.app.vault.on("delete", (file) => {
    if (file instanceof TAbstractFile
      && shouldRefreshScoreDashboardPath(file.path, scanRoots(), coverFolder())) refresh();
  }));
  plugin.registerEvent(plugin.app.vault.on("rename", (file, oldPath) => {
    const newPath = file instanceof TAbstractFile ? file.path : "";
    const previousPath = typeof oldPath === "string" ? oldPath : "";
    if (shouldRefreshScoreDashboardRename(previousPath, newPath, scanRoots(), coverFolder())) refresh();
  }));
  installDragAutoScroll(plugin);
}

function renderWorkspaceScoreDashboard(plugin: ScoreDashboardPlugin, container: HTMLElement): void {
  const dashboardHost = HOSTS.get(plugin);
  if (!dashboardHost) return;
  const state = STATES.get(plugin) ?? {
    type: "all",
    scale: SCORE_DASHBOARD_DEFAULT_SCALE,
    showUnrated: false,
  };
  container.addClass("animelist-score-dashboard-view");
  renderScoreDashboardWithBatchDrag(container, dashboardHost.collectMediaItems(), state, {
    openFile: (path) => dashboardHost.openMediaFile(path),
    applyChanges: (changes) => dashboardHost.applyScoreChanges(changes),
    confirmClamp: (summary) => dashboardHost.confirmScoreClamp(summary),
    showNotice: (message) => dashboardHost.showNotice(message),
    onStateChange: (nextState) => STATES.set(plugin, { ...nextState }),
  });
}

export const scoreDashboardFeature = defineFeature<AnimeListFeatureHost>({
  id: "score-dashboard",
  contributions: [{
    kind: "lifecycle",
    activate: activateDashboard,
  }, {
    kind: "workspace-page",
    page(host) {
      return {
        id: "scores",
        label: text.title,
        icon: "table-properties",
        order: 30,
        render: (container) => renderWorkspaceScoreDashboard(host, container),
      };
    },
  }],
});
