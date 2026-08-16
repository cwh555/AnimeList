import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkspaceLeaf } from "obsidian";
import { createDefaultSettings } from "../src/app/settings-model";
import type { LibraryRenderAdapters } from "../src/ui/library-contracts";
import { AnimeListView, type AnimeListViewHost } from "../src/ui/library-view";

describe("library view refresh ownership", () => {
  it("does not schedule a second render after favorite persistence already owns refresh", async () => {
    let adapters: LibraryRenderAdapters | undefined;
    let favorites = 0;
    let scheduled = 0;
    const originalWindow = globalThis.window;
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
      openMediaFile: async () => {},
      openAddModal: () => {},
      openEditModal: () => {},
      setFavorite: async () => { favorites += 1; },
      openTimeline: async () => {},
    };
    const view = new AnimeListView({} as WorkspaceLeaf, host);

    try {
      await view.onOpen();
      await adapters?.toggleFavorite?.("AnimeList/Anime/example.md", true);
      assert.equal(favorites, 1);
      assert.equal(scheduled, 0);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }
  });
});
