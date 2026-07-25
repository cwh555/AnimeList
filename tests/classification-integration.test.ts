import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile, TFolder, setRequestUrlMock } from "obsidian";
import { aniListClassificationTest } from "../src/anilist-classification";
import { aniListRequestTest } from "../src/anilist-client";
import { bangumiSubjectTest } from "../src/bangumi-subject";
import { installClassificationCreatePersistence } from "../src/classification-create-persistence";
import { setClassificationCreateDraft } from "../src/classification-create-state";
import { migrateMediaClassification } from "../src/classification-migration";
import { preferAniListSearchResults } from "../src/classification-search";
import { prepareClassificationCreate } from "../src/classification-ui";
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

function resetAniListState(): void {
  aniListClassificationTest.reset();
  aniListRequestTest.reset();
}

function aniListHealthResponse(): Record<string, unknown> {
  return {
    data: {
      Page: {
        media: [{
          id: 1,
          genres: ["Action", "Adventure", "Drama", "Sci-Fi"],
          tags: [],
          startDate: { year: 1998, month: 4 },
          studios: { nodes: [{ name: "SUNRISE" }] },
        }],
      },
    },
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

  it("simulates selected result preparation through note persistence", async () => {
    const selected = media({ genres: [] });
    resetAniListState();
    setRequestUrlMock((options: { url?: string }) => {
      if (options.url !== "https://graphql.anilist.co") throw new Error(`Unexpected request: ${options.url ?? ""}`);
      return {
        status: 200,
        json: {
          data: {
            Page: {
              media: [{
                id: 99468,
                genres: ["Comedy", "Romance", "Slice of Life"],
                tags: [{ name: "School", rank: 82 }],
                startDate: { year: 2018, month: 1 },
                studios: { nodes: [{ name: "Shin-Ei Animation" }] },
              }],
            },
          },
        },
        text: "",
      };
    });

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

    try {
      const prepared = await prepareClassificationCreate(host as never, selected);
      assert.equal(prepared.provider, "anilist");
      assert.deepEqual(prepared.genres, ["喜劇", "戀愛", "日常", "校園"]);
      installClassificationCreatePersistence(host as never);
      await host.createMediaNote({ ...prepared, genres: [...prepared.genres] }, form());
      assert.deepEqual(originalForm?.genres, ["喜劇", "戀愛", "日常", "校園"]);
      assert.deepEqual(frontmatter.genres, ["喜劇", "戀愛", "日常", "校園"]);
      assert.equal(frontmatter.classification_source_provider, "anilist");
      assert.equal(frontmatter.classification_source_id, "99468");
    } finally {
      setRequestUrlMock(null);
      resetAniListState();
    }
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

  it("excludes synthetic Test Vault notes and resolves user-created Bangumi and title-only notes", async () => {
    resetAniListState();
    bangumiSubjectTest.reset();
    const root = new TFolder();
    root.path = "AnimeList";
    const bangumiNote = new TFile();
    bangumiNote.path = "AnimeList/高木同學.md";
    bangumiNote.basename = "高木同學";
    const titleOnlyNote = new TFile();
    titleOnlyNote.path = "AnimeList/葬送的芙莉蓮.md";
    titleOnlyNote.basename = "葬送的芙莉蓮";
    const synthetic = new TFile();
    synthetic.path = "AnimeList/Test Fixtures/TEST 動畫.md";
    synthetic.basename = "TEST 動畫";
    root.children = [bangumiNote, titleOnlyNote, synthetic];

    const records = new Map<TFile, Record<string, unknown>>([
      [bangumiNote, {
        media_type: "anime",
        title: "擅長捉弄人的高木同學",
        format: "TV",
        year: 2018,
        source_provider: "bangumi",
        source_id: "218712",
        genres: ["TV", "2018", "搞笑"],
      }],
      [titleOnlyNote, {
        media_type: "anime",
        title: "葬送的芙莉蓮",
        format: "tv",
        year: 2023,
        genres: ["TV", "2023"],
        custom_field: "preserve",
      }],
      [synthetic, {
        animelist_test_fixture: true,
        media_type: "anime",
        title: "TEST 動畫",
        format: "tv",
        genres: ["測試資料"],
      }],
    ]);

    const requestedUrls: string[] = [];
    setRequestUrlMock((options: { url?: string }) => {
      requestedUrls.push(options.url ?? "");
      if (options.url === "https://graphql.anilist.co") {
        return { status: 200, json: aniListHealthResponse(), text: "" };
      }
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

    const canonicalTakagi = media();
    const frieren = media({
      sourceId: "154587",
      title: "Frieren: Beyond Journey’s End",
      originalTitle: "葬送のフリーレン",
      romajiTitle: "Sousou no Frieren",
      year: 2023,
      genres: ["冒險", "劇情", "奇幻", "魔法"],
      people: ["MADHOUSE"],
      searchTitles: ["葬送的芙莉蓮"],
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
        if (query === "からかい上手の高木さん") return [canonicalTakagi];
        if (query === "葬送的芙莉蓮") return [frieren];
        return [];
      },
    };

    try {
      const summary = await migrateMediaClassification(host as never, (state) => {
        progress.push(`${state.processed}/${state.total}:${state.title}`);
      });
      assert.ok(requestedUrls.includes("https://graphql.anilist.co"));
      assert.ok(requestedUrls.includes("https://api.bgm.tv/v0/subjects/218712"));
      assert.equal(summary.scanned, 2);
      assert.equal(summary.changed, 2);
      assert.equal(summary.unresolved, 0);
      assert.deepEqual(progress, ["1/2:擅長捉弄人的高木同學", "2/2:葬送的芙莉蓮"]);
      assert.deepEqual(records.get(bangumiNote)?.genres, ["喜劇", "戀愛", "日常", "校園"]);
      assert.equal(records.get(bangumiNote)?.classification_source_id, "99468");
      assert.deepEqual(records.get(titleOnlyNote)?.genres, ["冒險", "劇情", "奇幻", "魔法"]);
      assert.equal(records.get(titleOnlyNote)?.classification_source_id, "154587");
      assert.equal(records.get(titleOnlyNote)?.custom_field, "preserve");
      assert.deepEqual(records.get(synthetic)?.genres, ["測試資料"]);
    } finally {
      setRequestUrlMock(null);
      resetAniListState();
      bangumiSubjectTest.reset();
    }
  });

  it("aborts cleanup instead of marking every work unresolved when AniList fails", async () => {
    resetAniListState();
    const root = new TFolder();
    root.path = "AnimeList";
    const note = new TFile();
    note.path = "AnimeList/作品.md";
    note.basename = "作品";
    root.children = [note];
    const record = { media_type: "anime", title: "作品", format: "tv" };
    setRequestUrlMock(() => ({ status: 503, json: { errors: [{ message: "service unavailable" }] }, text: "" }));
    const host = {
      app: {
        vault: { getAbstractFileByPath: () => root },
        fileManager: {
          async processFrontMatter(_file: TFile, callback: (value: Record<string, unknown>) => void) { callback(record); },
        },
      },
      getScanFolders: () => ["AnimeList"],
      refreshViews() {},
      async searchAniList() { return []; },
    };
    try {
      await assert.rejects(
        migrateMediaClassification(host as never),
        /service unavailable|AniList request failed/i,
      );
    } finally {
      setRequestUrlMock(null);
      resetAniListState();
    }
  });
});
