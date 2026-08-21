import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkspaceLeaf } from "obsidian";
import { createDefaultSettings } from "../src/app/settings-model";
import type { LibraryRenderAdapters } from "../src/ui/library-contracts";
import { AnimeListView, type AnimeListViewHost } from "../src/ui/library-view";

function fakeElement(): any {
  const children: any[] = [];
  return {
    children,
    dataset: {},
    className: "",
    textContent: "",
    classList: { add() {}, remove() {}, toggle() {} },
    append(...nodes: any[]) { children.push(...nodes); },
    appendChild(node: any) { children.push(node); return node; },
    replaceChildren(...nodes: any[]) { children.splice(0, children.length, ...nodes); },
    setAttribute() {},
    addEventListener() {},
    querySelector() { return null; },
  };
}

describe("library view refresh ownership", () => {
  it("does not schedule a second render after favorite persistence already owns refresh", async () => {
    let adapters: LibraryRenderAdapters | undefined;
    let favorites = 0;
    let scheduled = 0;
    const originalWindow = globalThis.window;
    const originalCreateEl = globalThis.createEl;
    Object.defineProperty(globalThis, "createEl", { configurable: true, value: () => fakeElement() });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        setTimeout() { scheduled += 1; return 1; },
        clearTimeout() {},
      },
    });
    const settings = createDefaultSettings();
    const host: AnimeListViewHost = {
      settings,
      saveSettings: async () => {},
      renderLibrary: (_container, _items, nextAdapters) => { adapters = nextAdapters; },
      collectMediaItems: () => [],
      updateUiState: () => {},
      workspacePages: () => [],
      workspaceMenuActions: () => [],
      openMediaFile: async () => {},
      openAddModal: () => {},
      openEditModal: () => {},
      setFavorite: async () => { favorites += 1; },
    };
    const view = new AnimeListView({} as WorkspaceLeaf, host);
    Object.assign(view.contentEl, fakeElement());

    try {
      await view.onOpen();
      await adapters?.toggleFavorite?.("AnimeList/Anime/example.md", true);
      assert.equal(favorites, 1);
      assert.equal(scheduled, 0);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
      Object.defineProperty(globalThis, "createEl", { configurable: true, value: originalCreateEl });
    }
  });
  it("forwards persisted per-view column layout through the workspace renderer state", async () => {
    let adapters: LibraryRenderAdapters | undefined;
    let receivedState: ReturnType<typeof createDefaultSettings>["uiState"] | null = null;
    const originalCreateEl = globalThis.createEl;
    Object.defineProperty(globalThis, "createEl", { configurable: true, value: () => fakeElement() });
    const settings = createDefaultSettings();
    settings.uiState.layoutColumns = { grid: 5, poster: 2 };
    const host: AnimeListViewHost = {
      settings,
      saveSettings: async () => {},
      renderLibrary: (_container, _items, nextAdapters) => { adapters = nextAdapters; },
      collectMediaItems: () => [],
      updateUiState: (state) => { receivedState = state; },
      workspacePages: () => [],
      workspaceMenuActions: () => [],
      openMediaFile: async () => {},
      openAddModal: () => {},
      openEditModal: () => {},
      setFavorite: async () => {},
    };
    const view = new AnimeListView({} as WorkspaceLeaf, host);
    Object.assign(view.contentEl, fakeElement());

    try {
      await view.onOpen();
      assert.deepEqual(adapters?.initialState?.layoutColumns, { grid: 5, poster: 2 });
      adapters?.onStateChange?.({ layoutColumns: { grid: 4, poster: 2 } });
      assert.deepEqual(receivedState?.layoutColumns, { grid: 4, poster: 2 });
      assert.equal(receivedState?.view, "grid");
    } finally {
      Object.defineProperty(globalThis, "createEl", { configurable: true, value: originalCreateEl });
    }
  });

});
