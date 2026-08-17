import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App, TFile } from "obsidian";
import AnimeListPlugin from "../../src/main";
import { createDefaultSettings } from "../../src/app/settings-model";
import type { MediaItem } from "../../src/types";

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
});
