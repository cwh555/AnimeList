import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile, TFolder, setRequestUrlMock } from "obsidian";
import { aniListClassificationTest } from "../src/anilist-classification";
import { installClassificationCreatePersistence } from "../src/classification-create-persistence";
import { setClassificationCreateDraft } from "../src/classification-create-state";
import { migrateMediaClassification } from "../src/classification-migration";
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

  it("reads live frontmatter and reports changed, unchanged, unresolved, and progress", async () => {
    aniListClassificationTest.reset();
    const root = new TFolder();
    root.path = "AnimeList";
    const changed = new TFile();
    changed.path = "AnimeList/changed.md";
    changed.basename = "changed";
    const unchanged = new TFile();
    unchanged.path = "AnimeList/unchanged.md";
    unchanged.basename = "unchanged";
    const unresolved = new TFile();
    unresolved.path = "AnimeList/unresolved.md";
    unresolved.basename = "unresolved";
    root.children = [changed, unchanged, unresolved];

    const records = new Map<TFile, Record<string, unknown>>([
      [changed, { media_type: "anime", title: "Changed", source_provider: "anilist", source_id: "1", genres: ["TV", "2018"] }],
      [unchanged, {
        media_type: "anime", title: "Unchanged", source_provider: "anilist", source_id: "2",
        genres: ["喜劇"], classification_version: 4, classification_source_provider: "anilist",
        classification_source_id: "2", classification_legacy_genres: ["喜劇"], year: 2020, season: 4,
      }],
      [unresolved, { media_type: "game", title: "Unresolved" }],
    ]);

    setRequestUrlMock(() => ({
      json: {
        data: {
          Page: {
            media: [
              { id: 1, genres: ["Comedy"], tags: [], startDate: { year: 2018, month: 1 }, studios: { nodes: [] } },
              { id: 2, genres: ["Comedy"], tags: [], startDate: { year: 2020, month: 4 }, studios: { nodes: [] } },
            ],
          },
        },
      },
      text: "",
    }));

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
      async searchAniList() { return []; },
    };

    try {
      const summary = await migrateMediaClassification(host as never, (state) => {
        progress.push(`${state.processed}/${state.total}:${state.title}`);
      });
      assert.equal(summary.scanned, 3);
      assert.deepEqual(summary.changedEntries.map((entry) => entry.title), ["Changed"]);
      assert.deepEqual(summary.unchangedEntries.map((entry) => entry.title), ["Unchanged"]);
      assert.deepEqual(summary.unresolvedEntries.map((entry) => entry.title), ["Unresolved"]);
      assert.deepEqual(progress, ["1/2:Changed", "2/2:Unchanged"]);
      assert.deepEqual(records.get(changed)?.genres, ["喜劇"]);
    } finally {
      setRequestUrlMock(null);
      aniListClassificationTest.reset();
    }
  });
});
