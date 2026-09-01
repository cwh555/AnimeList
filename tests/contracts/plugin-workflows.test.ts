import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App, TFile } from "obsidian";
import AnimeListPlugin from "../../src/main";
import { AnimeListApplicationServices } from "../../src/app/anime-list-application";
import { createDefaultSettings } from "../../src/app/settings-model";
import type { MediaItem } from "../../src/types";
import { libraryExportFeature } from "../../src/features/library-export/feature";
import type { AnimeListFeatureHost } from "../../src/app/feature-types";

function timelineItem(): MediaItem {
  return {
    title: "Example",
    originalTitle: "",
    mediaType: "anime",
    format: "tv",
    status: "completed",
    releaseStatus: "finished",
    progress: 12,
    total: 12,
    unit: "episode",
    score: 8.5,
    favorite: false,
    year: 2026,
    genres: [],
    people: [],
    platforms: [],
    sourceUrls: [],
    cover: "",
    filePath: "AnimeList/Anime/example.md",
    updated: 0,
    updatedLabel: "",
    startedAt: "",
    completedAt: "2026-01-01",
    volumeLog: [],
  };
}

describe("plugin UI workflows", () => {

  it("keeps stored and provider tag values canonical through plugin service wiring", async () => {
    const plugin = new AnimeListPlugin();
    plugin.app = new App();
    plugin.settings = createDefaultSettings();
    const item = { ...timelineItem(), genres: ["動作", "Custom tag"], mediaTags: ["School", "Coming of Age"] };
    const result = {
      provider: "anilist",
      sourceId: "1",
      sourceUrl: "",
      mediaType: "anime" as const,
      title: "Example",
      originalTitle: "Example",
      romajiTitle: "Example",
      format: "tv",
      total: 12,
      unit: "episode",
      year: 2026,
      genres: ["動作", "戀愛"],
      rawGenres: ["Action", "Romance"],
      people: [],
      platforms: [],
      coverUrl: "",
      summary: "",
      externalScore: null,
      releaseStatus: "finished" as const,
      classification: {
        anilistId: "1",
        genres: ["動作"],
        tags: [],
        season: "winter" as const,
        seasonYear: 2026,
        studios: [],
        source: "manga",
        countryOfOrigin: "JP",
      },
    };
    let savedResult: typeof result | null = null;
    let savedGenres: string[] = [];
    const createdFile = new TFile();
    (plugin as unknown as { application: unknown }).application = {
      collectMediaItems: () => [item],
      searchExternal: async () => ({ results: [result], warnings: [] }),
      createMediaNote: async (nextResult: typeof result, form: { genres: string[] }) => {
        savedResult = nextResult;
        savedGenres = form.genres;
        return createdFile;
      },
    };

    const collected = plugin.collectMediaItems();
    assert.deepEqual(collected[0]?.genres, ["動作", "Custom tag"]);
    assert.deepEqual(collected[0]?.mediaTags, ["School", "Coming of Age"]);

    const searched = await plugin.searchExternal("anime", "Example");
    assert.deepEqual(searched.results[0]?.genres, ["動作", "戀愛"]);
    assert.deepEqual(searched.results[0]?.rawGenres, ["Action", "Romance"]);

    await plugin.createMediaNote(searched.results[0]!, {
      title: "Example",
      status: "planned",
      releaseStatus: "finished",
      progress: 0,
      total: 12,
      unit: "episode",
      score: null,
      favorite: false,
      startedAt: "",
      completedAt: "",
      genres: ["動作", "Custom tag"],
      templatePath: "",
      volumeLog: [],
    });
    assert.deepEqual(savedResult?.genres, ["動作", "戀愛"]);
    assert.deepEqual(savedResult?.classification.genres, ["動作"]);
    assert.deepEqual(savedGenres, ["動作", "Custom tag"]);
  });

  it("routes the timeline command into the shared AnimeList workspace", async () => {
    const plugin = Object.create(AnimeListPlugin.prototype) as AnimeListPlugin;
    plugin.app = new App();
    plugin.settings = createDefaultSettings();
    const sections: string[] = [];
    plugin.openLibrarySection = async (section) => { sections.push(section); };

    await plugin.openTimeline();

    assert.deepEqual(sections, ["timeline"]);
  });

  it("registers Library export as a command and workspace action rather than a new workspace page", async () => {
    const commands: Array<{ id: string; name: string }> = [];
    const host = {
      app: new App(),
      addCommand(command: { id: string; name: string }) { commands.push(command); },
    } as unknown as AnimeListFeatureHost;
    const lifecycle = libraryExportFeature.contributions.find((contribution) => contribution.kind === "lifecycle");
    assert.ok(lifecycle && lifecycle.kind === "lifecycle");
    await lifecycle.activate(host);
    assert.equal(commands[0]?.id, "export-library");

    const workspace = libraryExportFeature.contributions.find((contribution) => contribution.kind === "workspace-action");
    assert.ok(workspace && workspace.kind === "workspace-action");
    const action = workspace.action(host);
    assert.equal(action?.id, "export-library");
    assert.equal(action?.icon, "download");
    assert.equal(libraryExportFeature.contributions.some((contribution) => contribution.kind === "workspace-page"), false);
  });

  it("keeps full managed-media cleanup explicit on interaction paths", async () => {
    const settings = createDefaultSettings();
    const trashed: string[] = [];
    const app = {
      fileManager: {
        async trashFile(file: TFile) { trashed.push(file.path); },
      },
    } as unknown as App;
    const application = new AnimeListApplicationServices(
      app,
      "animelist",
      () => settings,
      { async openMediaFile() {}, refreshViews() {} },
    );
    const target = new TFile();
    target.path = "AnimeList/Anime/example.md";

    application.releaseDownloadedCover("AnimeList/Covers/anime/unused.jpg");
    await application.deleteMediaFile(target);

    assert.deepEqual(trashed, [target.path]);
  });

});