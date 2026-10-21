import assert from "node:assert/strict";
import { it } from "node:test";
import { TFile, type App } from "obsidian";
import { scoreDashboardFeature } from "../src/features/score-dashboard/feature";
import { emptyRankingState } from "../src/domain/pairwise-ranking";
import type { AnimeListFeatureHost } from "../src/app/feature-types";

it("removes an obsolete rank when completed status becomes ongoing", async () => {
  const path = "AnimeList/Anime/Example.md";
  const rankingPath = ".obsidian/animelist-ranking.json";
  const initial = emptyRankingState();
  initial.anime.ordered = [path, "AnimeList/Anime/Other.md"];

  const contents = new Map<string, ArrayBuffer>();
  const encode = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;
  const decode = (buffer: ArrayBuffer): string => new TextDecoder().decode(buffer);
  contents.set(rankingPath, encode(JSON.stringify(initial)));
  let status = "completed";
  const cacheCallbacks: Array<(file: TFile) => void> = [];
  const app = {
    vault: {
      configDir: ".obsidian",
      adapter: {
        exists: async (target: string) => contents.has(target) || target === ".obsidian",
        mkdir: async () => {},
        readBinary: async (target: string) => {
          const contentsForPath = contents.get(target);
          if (!contentsForPath) throw new Error("Missing " + target);
          return contentsForPath;
        },
        writeBinary: async (target: string, bytes: ArrayBuffer) => { contents.set(target, bytes); },
      },
      on: () => ({}),
    },
    metadataCache: {
      getFileCache: () => ({ frontmatter: { status, media_type: "anime" } }),
      on: (event: string, callback: (file: TFile) => void) => {
        if (event === "changed") cacheCallbacks.push(callback);
        return {};
      },
    },
    workspace: { getLeavesOfType: () => [] },
  } as unknown as App;

  const host = {
    app,
    settings: { coverFolder: "AnimeList/Covers" },
    getScanFolders: () => ["AnimeList"],
    collectMediaItems: () => [],
    refreshViews: () => {},
    registerEvent: () => {},
    registerView: () => {},
    addCommand: () => {},
    openLibrarySection: async () => {},
  } as unknown as AnimeListFeatureHost;

  const lifecycle = scoreDashboardFeature.contributions.find((c) => c.kind === "lifecycle");
  assert.ok(lifecycle && lifecycle.kind === "lifecycle");
  await lifecycle.activate(host);
  assert.ok(cacheCallbacks.length >= 2);

  const file = new TFile();
  file.path = path;
  status = "ongoing";
  cacheCallbacks.forEach((callback) => callback(file));
  // Allow the serialized async adapter write and the event handler promise to complete.
  for (let i = 0; i < 25; i++) await Promise.resolve();

  const updated = JSON.parse(decode(contents.get(rankingPath) ?? new ArrayBuffer(0))) as ReturnType<typeof emptyRankingState>;
  assert.deepEqual(updated.anime.ordered, ["AnimeList/Anime/Other.md"]);

  status = "completed";
  cacheCallbacks.forEach((callback) => callback(file));
  for (let i = 0; i < 25; i++) await Promise.resolve();
  const later = JSON.parse(decode(contents.get(rankingPath) ?? new ArrayBuffer(0))) as ReturnType<typeof emptyRankingState>;
  assert.deepEqual(later.anime.ordered, ["AnimeList/Anime/Other.md"]);
});
