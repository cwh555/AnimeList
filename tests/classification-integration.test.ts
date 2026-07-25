import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile, TFolder, setRequestUrlMock } from "obsidian";
import { aniListClassificationTest } from "../src/anilist-classification";
import { bangumiSubjectTest } from "../src/bangumi-subject";
import { installClassificationCreatePersistence } from "../src/classification-create-persistence";
import { setClassificationCreateDraft } from "../src/classification-create-state";
import { migrateMediaClassification } from "../src/classification-migration";
import { preferAniListSearchResults } from "../src/classification-search";
import { searchMultilingualProviders } from "../src/multilingual-search";
import type { ExternalMediaResult, MediaNoteForm } from "../src/types";

function media(overrides: Partial<ExternalMediaResult> = {}): ExternalMediaResult {
  return {
    provider: "anilist",
    sourceId: "99468",
    title: "擅長捉弄人的高木同學",
    originalTitle: "からかい上手の高木さん",
    romajiTitle: "Karakai Jouzu no Takagi-san",
    mediaType: "anime",
    format: "tv",
    total: 12,
    unit: "episode",
    year: 2018,
    season: 1,
    genres: ["喜劇", "戀愛", "日常", "校園"],
    tags: [],
    rawGenres: [],
    rawTags: [],
    people: ["Shin-Ei Animation"],
    platforms: [],
    sourceUrl: "",
    coverUrl: "",
    summary: "",
    externalScore: null,
    releaseStatus: "finished",
    searchTitles: ["Teasing Master Takagi-san"],
    ...overrides,
  };
}

function form(): MediaNoteForm {
  return {
    title: "擅長捉弄人的高木同學",
    status: "planned",
    releaseStatus: "finished",
    progress: 0,
    total: 12,
    unit: "episode",
    score: null,
    favorite: false,
    startedAt: "",
    completedAt: "",
    genres: [],
    tags: [],
    templatePath: "",
    volumeLog: [],
  };
}

describe("classification runtime integration", () => {
  it("uses a Bangumi alias to obtain canonical AniList classifications before selection", async () => {
    const bangumi = media({
      provider: "bangumi",
      sourceId: "218712",
      genres: [],
      title: "擅長捉弄人的高木同學",
      searchTitles: ["擅長捉弄人的高木同學", "からかい上手の高木さん"],
    });
    const canonical = media();
    const aniListQueries: string[] = [];
    const response = await searchMultilingualProviders({
      query: "擅長捉弄人的高木同學",
      providers: [
        {
          label: "AniList",
          singleQueryOnly: true,
          async search(query) {
            aniListQueries.push(query);
            return query === "からかい上手の高木さん" ? [canonical] : [];
          },
        },
        {
          label: "Bangumi",
          supportsChineseDiscovery: true,
          async search(query) { return query === "擅長捉弄人的高木同學" ? [bangumi] : []; },
        },
      ],
      dedupe: preferAniListSearchResults,
    });
    const results = preferAniListSearchResults(response.results);
    assert.ok(aniListQueries.includes("からかい上手の高木さん"));
    assert.equal(results[0]?.provider, "anilist");
    assert.deepEqual(results[0]?.genres, ["喜劇", "戀愛", "日常", "校園"]);
  });

  it("carries automatic classification across cloned modal result objects", async () => {
    const selected = media();
    const clonedByModal = { ...selected, genres: [...selected.genres], tags: [] };
    const file = new TFile();
    file.path = "AnimeList/擅長捉弄人的高木同學.md";
    file.basename = "擅長捉弄人的高木同學";
    const frontmatter: Record<string, unknown> = {};
    let originalForm: MediaNoteForm | null = null;
    const host = {
      app: {
        fileManager: {
          async processFrontMatter(_file: TFile, callback: (value: Record<string, unknown>) => void) {
            callback(frontmatter);
          },
        },
      },
      async searchAniList() { return [selected]; },
      async createMediaNote(_result: ExternalMediaResult, nextForm: MediaNoteForm) {
        originalForm = nextForm;
        return file;
      },
    };

    setClassificationCreateDraft(selected, { genres: selected.genres, tags: ["自訂標籤"] });
    installClassificationCreatePersistence(host as never);
    await host.createMediaNote(clonedByModal, form());

    assert.deepEqual(originalForm?.genres, ["喜劇", "戀愛", "日常", "校園"]);
    assert.deepEqual(originalForm?.tags, ["自訂標籤"]);
    assert.deepEqual(frontmatter.genres, ["喜劇", "戀愛", "日常", "校園"]);
    assert.deepEqual(frontmatter.media_tags, ["自訂標籤"]);
    assert.equal(frontmatter.classification_source_id, "99468");
  });

  it("resolves a legacy Bangumi note through subject aliases and reports progress", async () => {
    aniListClassificationTest.reset();
    bangumiSubjectTest.reset();
    const root = new TFolder();
    root.path = "AnimeList";
    const changed = new TFile();
    changed.path = "AnimeList/高木同學.md";
    changed.basename = "高木同學";
    const unresolved = new TFile();
    unresolved.path = "AnimeList/unresolved.md";
    unresolved.basename = "unresolved";
    root.children = [changed, unresolved];

    const records = new Map<TFile, Record<string, unknown>>([
      [changed, {
        media_type: "anime",
        title: "擅長捉弄人的高木同學",
        format: "TV",
        year: 2018,
        source_provider: "bangumi",
        source_id: "218712",
        genres: ["TV", "2018", "搞笑"],
      }],
      [unresolved, { media_type: "game", title: "Unresolved" }],
    ]);

    const requestedUrls: string[] = [];
    setRequestUrlMock((options: { url?: string }) => {
      requestedUrls.push(options.url ?? "");
      if (options.url === "https://api.bgm.tv/v0/subjects/218712") {
        return {
          status: 200,
          json: {
            name: "からかい上手の高木さん",
            name_cn: "擅长捉弄的高木同学",
            infobox: [{ key: "別名", value: [{ v: "Karakai Jouzu no Takagi-san" }] }],
          },
          text: "",
        };
      }
      throw new Error(`Unexpected request: ${options.url ?? ""}`);
    });

    const progress: string[] = [];
    const host = {
      app: {
        vault: { getAbstractFileByPath: () => root },
        fileManager: {
          async processFrontMatter(file: TFile, callback: (value: Record<string, unknown>) => void) {
            callback(records.get(file) ?? {});
          },
        },
      },
      getScanFolders: () => ["AnimeList"],
      refreshViews() {},
      async searchAniList(_mediaType: string, query: string) {
        return query === "からかい上手の高木さん" ? [media()] : [];
      },
    };

    try {
      const summary = await migrateMediaClassification(host as never, (state) => {
        progress.push(`${state.processed}/${state.total}:${state.title}`);
      });
      assert.ok(requestedUrls.includes("https://api.bgm.tv/v0/subjects/218712"));
      assert.equal(summary.scanned, 2);
      assert.deepEqual(summary.changedEntries.map((entry) => entry.title), ["擅長捉弄人的高木同學"]);
      assert.deepEqual(summary.unresolvedEntries.map((entry) => entry.title), ["Unresolved"]);
      assert.deepEqual(progress, ["1/2:擅長捉弄人的高木同學", "2/2:Unresolved"]);
      assert.deepEqual(records.get(changed)?.genres, ["喜劇", "戀愛", "日常", "校園"]);
      assert.equal(records.get(changed)?.classification_source_provider, "anilist");
      assert.equal(records.get(changed)?.classification_source_id, "99468");
    } finally {
      setRequestUrlMock(null);
      aniListClassificationTest.reset();
      bangumiSubjectTest.reset();
    }
  });
});
