import { Notice, TAbstractFile, TFile, type WorkspaceLeaf } from "obsidian";
import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { ScoreDashboardRefreshGuard, shouldRefreshScoreDashboardMetadata, shouldRefreshScoreDashboardPath, shouldRefreshScoreDashboardRename } from "../../app/score-dashboard/refresh";
import { applyScoreDashboardChanges } from "../../data/score-dashboard/score-service";
import { ScoreDashboardDragAutoScroller } from "../../domain/score-dashboard/drag-scroll";
import { SCORE_DASHBOARD_DEFAULT_SCALE } from "../../domain/score-dashboard/model";
import { disposeScoreDashboardInteractions, renderScoreDashboardWithBatchDrag } from "../../ui/score-dashboard/batch-drag";
import { PairwiseRankingStore } from "../../data/pairwise-ranking/store";
import { renderRankingPanel } from "../../ui/pairwise-ranking/panel";
import { rankingText } from "../pairwise-ranking/text";
import { LibraryExportModal } from "../../ui/library-export-modal";
import { errorMessage } from "../../ui/ui-helpers";
import { pathBelongsToLibraryRoot } from "../../data/library-change-scope";
import { normalizeMediaStatus } from "../../domain/media-status";
import type { MediaType } from "../../domain/media-types";
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
const RANK_STORES = new WeakMap<object, PairwiseRankingStore>();
interface RankingWorkspaceState { mode: "rating" | "ranking"; type: MediaType }
const RANK_STATES = new WeakMap<HTMLElement, RankingWorkspaceState>();
const RATING_MOUNTS = new WeakMap<HTMLElement, HTMLElement>();

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
  const rankingStore = new PairwiseRankingStore(plugin.app);
  RANK_STORES.set(plugin, rankingStore);
  plugin.registerEvent(plugin.app.metadataCache.on("changed", (file) => {
    if (!(file instanceof TFile) || file.extension !== "md"
      || !plugin.getScanFolders().some((root) => pathBelongsToLibraryRoot(file.path, root))) return;
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter || !Object.hasOwn(frontmatter, "status")
      || normalizeMediaStatus(frontmatter.status) === "completed") return;
    // Once a completed work becomes unfinished, its old position is obsolete.
    // A future completion should enter the "unranked" pool for re-insertion.
    void rankingStore.remove(file.path).then((changed) => {
      if (changed) plugin.refreshViews();
    }).catch((error: unknown) => {
      dashboardHost.showNotice(rankingText("failed", { reason: errorMessage(error) }));
    });
  }));
  plugin.registerEvent(plugin.app.vault.on("delete", (file) => {
    if (!(file instanceof TFile)) return;
    void rankingStore.remove(file.path).then((changed) => {
      if (changed) plugin.refreshViews();
    }).catch((error: unknown) => {
      dashboardHost.showNotice(rankingText("failed", { reason: errorMessage(error) }));
    });
  }));
  plugin.registerEvent(plugin.app.vault.on("rename", (file, oldPath) => {
    if (!(file instanceof TFile) || typeof oldPath !== "string") return;
    void rankingStore.rename(oldPath, file.path).then((changed) => {
      if (changed) plugin.refreshViews();
    }).catch((error: unknown) => {
      dashboardHost.showNotice(rankingText("failed", {
        reason: errorMessage(error),
      }));
    });
  }));

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
  const rankingStore = RANK_STORES.get(plugin);
  if (!dashboardHost || !rankingStore) return;
  const scoreState = STATES.get(plugin) ?? {
    type: "all",
    scale: SCORE_DASHBOARD_DEFAULT_SCALE,
    showUnrated: false,
  };
  const rankState = RANK_STATES.get(container) ?? { mode: "rating", type: "anime" };
  const preserveRankingScroll = container.querySelector(".al-ranking-panel") !== null;
  const previousRankingScrollTop = preserveRankingScroll ? container.scrollTop : 0;
  const previous = RATING_MOUNTS.get(container);
  if (previous) disposeScoreDashboardInteractions(previous);
  RATING_MOUNTS.delete(container);
  container.replaceChildren();
  container.classList.toggle("animelist-score-dashboard-view", rankState.mode === "rating");
  container.classList.toggle("animelist-ranking-view", rankState.mode === "ranking");

  const tabs = createEl("nav");
  tabs.className = "al-ranking-mode-tabs";
  tabs.setAttribute("aria-label", rankingText("title"));
  for (const mode of ["rating", "ranking"] as const) {
    const tab = createEl("button");
    tab.type = "button";
    tab.textContent = rankingText(mode === "rating" ? "modeRating" : "modeRanking");
    tab.classList.toggle("is-active", rankState.mode === mode);
    tab.setAttribute("aria-pressed", String(rankState.mode === mode));
    tab.addEventListener("click", () => {
      if (rankState.mode === mode) return;
      rankState.mode = mode;
      RANK_STATES.set(container, rankState);
      renderWorkspaceScoreDashboard(plugin, container);
    });
    tabs.appendChild(tab);
  }
  const exportAction = createEl("button");
  exportAction.type = "button";
  exportAction.className = "al-ranking-workspace-export";
  exportAction.textContent = "Export";
  exportAction.title = "Export";
  exportAction.addEventListener("click", () => {
    new LibraryExportModal(plugin, {
      kind: rankState.mode === "rating" ? "scoreboard" : "ranking",
      mediaType: rankState.mode === "rating" ? scoreState.type : rankState.type,
    }).open();
  });
  tabs.appendChild(exportAction);
  if (rankState.mode === "rating") {
    // Preserve the original scroll host: the existing rating drag/scroll logic
    // deliberately operates on this exact workspace container.
    RATING_MOUNTS.set(container, container);
    renderScoreDashboardWithBatchDrag(container, dashboardHost.collectMediaItems(), scoreState, {
      openFile: (path) => dashboardHost.openMediaFile(path),
      applyChanges: (changes) => dashboardHost.applyScoreChanges(changes),
      confirmClamp: (summary) => dashboardHost.confirmScoreClamp(summary),
      showNotice: (message) => dashboardHost.showNotice(message),
      onStateChange: (nextState) => STATES.set(plugin, { ...nextState }),
    }, tabs);
    return;
  }

  const body = createDiv();
  body.className = "al-score-mode-content";
  container.append(tabs, body);
  const redraw = () => {
    if (!container.isConnected || rankState.mode !== "ranking") return;
    renderWorkspaceScoreDashboard(plugin, container);
  };
  void renderRankingPanel(body, {
    app: plugin.app,
    store: rankingStore,
    items: dashboardHost.collectMediaItems(),
    type: rankState.type,
    setType(value) {
      rankState.type = value;
      RANK_STATES.set(container, rankState);
      redraw();
    },
    redraw,
    openNote: (path) => dashboardHost.openMediaFile(path),
    showNotice: (message) => dashboardHost.showNotice(message),
  }).then(() => {
    // A rank edit may rebuild a long List; retain its scroll position afterward.
    if (body.isConnected && rankState.mode === "ranking") {
      container.scrollTop = previousRankingScrollTop;
    }
  }).catch((error: unknown) => {
    dashboardHost.showNotice(rankingText("failed", { reason: errorMessage(error) }));
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
