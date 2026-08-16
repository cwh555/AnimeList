import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createReliableLibraryOpener,
  type LibraryNavigationAdapter,
} from "../src/app/library-navigation";

interface TestLeaf {
  view?: { showSection(section: "library"): Promise<void> };
  setViewState(state: { type: string; active: boolean }): Promise<void>;
}

function adapter(overrides: Partial<LibraryNavigationAdapter<TestLeaf>> = {}) {
  const events: string[] = [];
  const leaf: TestLeaf = {
    view: {
      async showSection(section): Promise<void> {
        events.push(`show:${section}`);
      },
    },
    async setViewState(state): Promise<void> {
      events.push(`activate:${state.type}:${state.active}`);
    },
  };
  const value: LibraryNavigationAdapter<TestLeaf> = {
    findLeaves: () => [],
    createLeaf: () => leaf,
    activateLeaf: (target) => target.setViewState({ type: "animelist-library", active: true }),
    revealLeaf: () => events.push("reveal"),
    showLibrary: async (target) => {
      if (!target.view) throw new Error("The AnimeList library view was not available after activation.");
      await target.view.showSection("library");
    },
    initializeLibrary: async () => { events.push("initialize"); },
    reportOpenFailure: (error) => events.push(`open-failure:${String(error)}`),
    reportSetupFailure: (error) => events.push(`setup-failure:${String(error)}`),
    ...overrides,
  };
  return { adapter: value, events, leaf };
}

describe("reliable library navigation", () => {
  it("reveals the library before best-effort folder setup", async () => {
    const setup = adapter({
      initializeLibrary: async () => {
        setup.events.push("initialize");
        throw new Error("folder conflict");
      },
      reportSetupFailure: (error) => setup.events.push(`setup:${(error as Error).message}`),
    });
    const open = createReliableLibraryOpener(setup.adapter);

    await open();

    assert.deepEqual(setup.events, [
      "activate:animelist-library:true",
      "reveal",
      "show:library",
      "initialize",
      "setup:folder conflict",
    ]);
  });

  it("uses an existing library leaf without opening another tab", async () => {
    const setup = adapter();
    let created = 0;
    setup.adapter.findLeaves = () => [setup.leaf];
    setup.adapter.createLeaf = () => {
      created += 1;
      return setup.leaf;
    };

    await createReliableLibraryOpener(setup.adapter)();

    assert.equal(created, 0);
    assert.deepEqual(setup.events, ["reveal", "show:library", "initialize"]);
  });

  it("coalesces repeated clicks into one navigation operation", async () => {
    const setup = adapter();
    let release: (() => void) | undefined;
    setup.adapter.initializeLibrary = () => new Promise<void>((resolve) => {
      setup.events.push("initialize");
      release = resolve;
    });
    const open = createReliableLibraryOpener(setup.adapter);

    const first = open();
    const second = open();
    for (let attempt = 0; attempt < 10 && !release; attempt += 1) {
      await Promise.resolve();
    }
    assert.ok(release, "the shared navigation operation should reach folder setup");
    release();
    await Promise.all([first, second]);

    assert.equal(setup.events.filter((event) => event.startsWith("activate:")).length, 1);
    assert.equal(setup.events.filter((event) => event === "reveal").length, 1);
    assert.equal(setup.events.filter((event) => event === "initialize").length, 1);
  });

  it("reports an actionable failure when the activated view is unavailable", async () => {
    const setup = adapter();
    setup.leaf.view = undefined;
    setup.adapter.reportOpenFailure = (error) => setup.events.push(`failure:${(error as Error).message}`);

    await createReliableLibraryOpener(setup.adapter)();

    assert.ok(setup.events.some((event) => event.includes("library view was not available")));
    assert.equal(setup.events.includes("initialize"), false);
  });
});
