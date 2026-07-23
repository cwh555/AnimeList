import { Notice } from "obsidian";
import { searchFeatureText } from "./search-feature-text";

const LIBRARY_VIEW_TYPE = "animelist-library";
const INSTALL_MARKER = Symbol.for("animelist.reliable-library-navigation");

interface LibraryViewLike {
  showSection?: (section: "library") => Promise<void>;
}

interface LibraryLeafLike {
  view?: LibraryViewLike;
  setViewState(state: { type: string; active: boolean }): Promise<void>;
}

export interface LibraryNavigationAdapter {
  findLeaves(): LibraryLeafLike[];
  createLeaf(): LibraryLeafLike;
  revealLeaf(leaf: LibraryLeafLike): void;
  initializeLibrary(): Promise<void>;
  reportOpenFailure(error: unknown): void;
  reportSetupFailure(error: unknown): void;
}

interface LibraryNavigationPlugin {
  app: {
    workspace: {
      getLeavesOfType(type: string): LibraryLeafLike[];
      getLeaf(type: "tab"): LibraryLeafLike;
      revealLeaf(leaf: LibraryLeafLike): void;
    };
  };
  initializeLibrary(copyTemplates?: boolean): Promise<void>;
  openLibrary(): Promise<void>;
  [INSTALL_MARKER]?: boolean;
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  return typeof value === "string" && value.trim() ? value : "Unknown error";
}

async function openOnce(adapter: LibraryNavigationAdapter): Promise<void> {
  let leaf = adapter.findLeaves()[0];
  if (!leaf) {
    leaf = adapter.createLeaf();
    await leaf.setViewState({ type: LIBRARY_VIEW_TYPE, active: true });
  }

  adapter.revealLeaf(leaf);
  if (typeof leaf.view?.showSection !== "function") {
    throw new Error("The AnimeList library view was not available after activation.");
  }
  await leaf.view.showSection("library");

  try {
    await adapter.initializeLibrary();
  } catch (error) {
    adapter.reportSetupFailure(error);
  }
}

export function createReliableLibraryOpener(adapter: LibraryNavigationAdapter): () => Promise<void> {
  let pending: Promise<void> | null = null;
  return async (): Promise<void> => {
    if (pending !== null) return pending;
    pending = openOnce(adapter)
      .catch((error: unknown) => {
        adapter.reportOpenFailure(error);
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}

function isLibraryNavigationPlugin(value: unknown): value is LibraryNavigationPlugin {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<LibraryNavigationPlugin>;
  return typeof candidate.openLibrary === "function"
    && typeof candidate.initializeLibrary === "function"
    && typeof candidate.app?.workspace?.getLeavesOfType === "function"
    && typeof candidate.app.workspace.getLeaf === "function"
    && typeof candidate.app.workspace.revealLeaf === "function";
}

export function installReliableLibraryNavigation(value: unknown): void {
  if (!isLibraryNavigationPlugin(value) || value[INSTALL_MARKER] === true) return;
  const plugin = value;
  const opener = createReliableLibraryOpener({
    findLeaves: () => plugin.app.workspace.getLeavesOfType(LIBRARY_VIEW_TYPE),
    createLeaf: () => plugin.app.workspace.getLeaf("tab"),
    revealLeaf: (leaf) => plugin.app.workspace.revealLeaf(leaf),
    initializeLibrary: () => plugin.initializeLibrary(false),
    reportOpenFailure: (error) => {
      console.error("AnimeList could not open the library", error);
      new Notice(searchFeatureText("library.openFailed", { message: errorMessage(error) }));
    },
    reportSetupFailure: (error) => {
      console.error("AnimeList could not create configured folders", error);
      new Notice(searchFeatureText("library.setupFailed", { message: errorMessage(error) }));
    },
  });
  plugin.openLibrary = opener;
  Object.defineProperty(plugin, INSTALL_MARKER, { value: true });
}
