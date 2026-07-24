import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classificationFromAniListMedia, mergeAniListClassifications } from "../src/anilist-classification";
import { CLASSIFICATION_TEXT } from "../src/classification-feature-text";
import {
  automaticClassificationForResult,
  migrateClassificationFrontmatter,
  storedClassificationSelection,
} from "../src/classification-compatibility";
import { classificationMetadataForResult } from "../src/classification-ui";
import { preferAniListSearchResults } from "../src/classification-search";
import {
  attachAniListGenres,
  attachAniListTags,
  classificationSuggestions,
  normalizeAutomaticValues,
} from "../src/media-classification";
import type { ExternalMediaResult } from "../src/types";

function result(overrides: Partial<ExternalMediaResult> = {}): ExternalMediaResult {
  return {
    provider: "anilist", sourceId: "99468", title: "擅長捉弄人的高木同學",
    originalTitle: "からかい上手の高木さん", romajiTitle: "Karakai Jouzu no Takagi-san",
    mediaType: "anime", format: "tv", total: 12, unit: "episode", year: 2018,
    genres: [], tags: [], rawGenres: [], rawTags: [], people: [], platforms: [],
    sourceUrl: "https://anilist.co/anime/99468", coverUrl: "", summary: "",
    externalScore: 7.4, releaseStatus: "finished", ...overrides,
  };
}

const takagiTags = [
  { name: "Primarily Child Cast", rank: 96 }, { name: "Heterosexual", rank: 96 },
  { name: "School", rank: 82 }, { name: "Slapstick", rank: 80 },
  { name: "Ensemble Cast", rank: 79 }, { name: "Episodic", rank: 75 },
];

describe("media classification", () => {
  it("maps representative works to broad seasonal-guide categories", () => {
    const cases = [
      { genres: ["Comedy", "Romance", "Slice of Life"], tags: [{ name: "School", rank: 82 }], expected: ["喜劇", "戀愛", "日常", "校園"] },
      { genres: ["Adventure", "Comedy", "Fantasy"], tags: [{ name: "Dungeon", rank: 99 }, { name: "Food", rank: 98 }, { name: "Magic", rank: 85 }], expected: ["冒險", "喜劇", "奇幻", "魔法"] },
      { genres: ["Drama", "Mystery"], tags: [{ name: "Medicine", rank: 96 }, { name: "Historical", rank: 88 }, { name: "Work", rank: 81 }], expected: ["劇情", "懸疑", "歷史"] },
      { genres: ["Action", "Drama", "Fantasy", "Mystery"], tags: [{ name: "Revenge", rank: 93 }, { name: "Military", rank: 88 }, { name: "Survival", rank: 80 }], expected: ["動作", "劇情", "奇幻", "懸疑", "軍事"] },
    ];
    for (const item of cases) assert.deepEqual(attachAniListGenres(item.genres, item.tags), item.expected);
  });

  it("does not auto-import provider detail tags", () => {
    assert.deepEqual(attachAniListTags(takagiTags), []);
  });

  it("classifies Takagi-san without title, staff, studio, or adaptation pollution", () => {
    const classification = classificationFromAniListMedia({
      id: 99468, genres: ["Comedy", "Romance", "Slice of Life"], tags: takagiTags,
      startDate: { year: 2018 }, studios: { nodes: [{ name: "Shin-Ei Animation" }] },
    });
    assert.deepEqual(classification.genres, ["喜劇", "戀愛", "日常", "校園"]);
    assert.deepEqual(classification.tags, []);
    assert.equal(classification.year, 2018);
    assert.deepEqual(classification.people, ["Shin-Ei Animation"]);
  });

  it("keeps AniList canonical while retaining the Bangumi Chinese title", () => {
    const aniList = result({ title: "Teasing Master Takagi-san", genres: ["喜劇", "戀愛", "日常", "校園"] });
    const bangumi = result({ provider: "bangumi", sourceId: "248175", title: "擅長捉弄人的高木同學", genres: [] });
    const [merged] = preferAniListSearchResults([bangumi, aniList]);
    assert.equal(merged?.provider, "anilist");
    assert.equal(merged?.title, "擅長捉弄人的高木同學");
    assert.deepEqual(merged?.genres, ["喜劇", "戀愛", "日常", "校園"]);
  });

  it("never treats unknown provider metadata as automatic classifications", () => {
    assert.deepEqual(normalizeAutomaticValues([
      "戀愛", "日常", "狗糧", "擅長捉弄人的高木同學", "漫畫改",
      "SHIN_EI", "漫改", "高橋李依", "赤城博昭",
    ], "genre"), ["戀愛", "日常"]);
    assert.deepEqual(automaticClassificationForResult(result({ provider: "bangumi", genres: ["戀愛"] })), { genres: [], tags: [] });
  });

  it("uses strict fallback and exact AniList enrichment", () => {
    const source = result({ genres: ["Romance", "Slice of Life", "SHIN_EI"], tags: ["School"] });
    const [fallback] = mergeAniListClassifications([source], new Map());
    assert.deepEqual(fallback?.genres, ["戀愛", "日常"]);
    assert.deepEqual(fallback?.tags, []);
    const [enriched] = mergeAniListClassifications([source], new Map([["99468", {
      genres: ["喜劇", "戀愛", "日常", "校園"], tags: [], year: 2018, people: ["Shin-Ei Animation"],
    }]]));
    assert.deepEqual(enriched?.genres, ["喜劇", "戀愛", "日常", "校園"]);
  });

  it("preserves stored custom values until explicit migration", () => {
    assert.deepEqual(storedClassificationSelection({ genres: ["戀愛", "使用者自訂分類"], media_tags: ["自訂標籤"] }), {
      genres: ["戀愛", "使用者自訂分類"], tags: ["自訂標籤"],
    });
    const frontmatter: Record<string, unknown> = {
      title: "擅長捉弄人的高木同學", year: 2018, media_type: "anime", source_provider: "bangumi",
      genres: ["戀愛", "日常", "校園", "擅長捉弄人的高木同學", "漫畫改", "高橋李依"],
      media_tags: ["自訂標籤"], tags: ["obsidian-project-tag"], unrelated: true,
    };
    migrateClassificationFrontmatter(frontmatter, "擅長捉弄人的高木同學");
    assert.deepEqual(frontmatter.genres, ["戀愛", "日常", "校園", "高橋李依"]);
    assert.deepEqual(frontmatter.media_tags, ["自訂標籤"]);
    assert.deepEqual(frontmatter.tags, ["obsidian-project-tag"]);
    assert.equal(frontmatter.unrelated, true);
  });

  it("keeps metadata separate and settings text English-only", () => {
    assert.deepEqual(classificationMetadataForResult(result({ people: ["Shin-Ei Animation"] })), [
      { label: "年份", value: "2018" }, { label: "製作公司", value: "Shin-Ei Animation" },
    ]);
    assert.ok(classificationSuggestions("genre").includes("校園"));
    const settings = Object.entries(CLASSIFICATION_TEXT).filter(([key]) => key.startsWith("settings.")).map(([, value]) => value).join(" ");
    assert.doesNotMatch(settings, /[\u3400-\u9fff]/u);
  });
});

import { Modal, TFile, TFolder, setRequestUrlMock } from "obsidian";
import { installClassificationUi } from "../src/classification-ui";
import { resolveClassifiedMediaResult } from "../src/classification-resolution";
import { migrateMediaClassification } from "../src/classification-migration";

function aniListPayload(id = 99468): Record<string, unknown> {
  return {
    data: {
      Page: {
        media: [{
          id,
          genres: ["Comedy", "Romance", "Slice of Life"],
          tags: [{ name: "School", rank: 82 }],
          startDate: { year: 2018 },
          studios: { nodes: [{ name: "Shin-Ei Animation" }] },
        }],
      },
    },
  };
}

it("resolves a selected Bangumi work before rendering and writes automatic genres during collection", async () => {
  setRequestUrlMock(() => ({ json: aniListPayload() }));
  try {
    const bangumi = result({
      provider: "bangumi",
      sourceId: "248175",
      title: "擅長捉弄人的高木同學",
      originalTitle: "からかい上手の高木さん",
      romajiTitle: "",
      genres: [],
    });
    const aniList = result({
      provider: "anilist",
      sourceId: "99468",
      title: "Karakai Jouzu no Takagi-san",
      originalTitle: "からかい上手の高木さん",
      romajiTitle: "Karakai Jouzu no Takagi-san",
      genres: [],
    });

    const resolved = await resolveClassifiedMediaResult({
      searchAniList: async () => [aniList],
    }, bangumi);
    assert.equal(resolved.provider, "anilist");
    assert.equal(resolved.sourceId, "99468");
    assert.equal(resolved.title, "擅長捉弄人的高木同學");
    assert.deepEqual(resolved.genres, ["喜劇", "戀愛", "日常", "校園"]);

    const modal = new Modal() as Modal & { renderDetails?: (item: ExternalMediaResult) => Promise<void> };
    modal.modalEl = { classList: { contains: (value: string) => value === "animelist-modal" } };
    modal.contentEl = { querySelector: () => null };
    let rendered: ExternalMediaResult | null = null;
    modal.renderDetails = async (item) => { rendered = item; };

    const file = new TFile();
    file.path = "Anime/Takagi.md";
    file.basename = "Takagi";
    const written: Record<string, unknown> = {};
    let submittedGenres: string[] = [];
    const plugin = {
      app: {
        fileManager: {
          processFrontMatter: async (_file: TFile, change: (frontmatter: Record<string, unknown>) => void) => change(written),
        },
        vault: { getAbstractFileByPath: () => null },
        metadataCache: { getFileCache: () => null },
      },
      searchAniList: async () => [aniList],
      createMediaNote: async (_item: ExternalMediaResult, form: { genres: string[] }) => {
        submittedGenres = [...form.genres];
        return file;
      },
      openAddModal: () => modal.open(),
      openEditModal: () => undefined,
      collectMediaItems: () => [],
    };

    installClassificationUi(plugin as never);
    plugin.openAddModal();
    await modal.renderDetails?.(bangumi);
    assert.ok(rendered);
    assert.equal(rendered?.provider, "anilist");
    assert.deepEqual(rendered?.genres, ["喜劇", "戀愛", "日常", "校園"]);

    await plugin.createMediaNote(rendered as ExternalMediaResult, {
      title: "擅長捉弄人的高木同學",
      status: "planned",
      releaseStatus: "unknown",
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
    } as never);
    assert.deepEqual(submittedGenres, ["喜劇", "戀愛", "日常", "校園"]);
    assert.deepEqual(written.genres, ["喜劇", "戀愛", "日常", "校園"]);
  } finally {
    setRequestUrlMock(null);
  }
});

it("rebuilds a polluted legacy note from AniList and reports the exact migration result", async () => {
  setRequestUrlMock(() => ({ json: aniListPayload() }));
  try {
    const frontmatter: Record<string, unknown> = {
      title: "擅長捉弄人的高木同學",
      title_original: "からかい上手の高木さん",
      media_type: "anime",
      format: "tv",
      year: 2018,
      source_provider: "bangumi",
      source_id: "248175",
      genres: ["戀愛", "日常", "狗糧", "擅長捉弄人的高木同學", "漫畫改", "SHIN_EI", "高橋李依", "赤城博昭"],
      media_tags: ["我的標籤", "2018", "擅長捉弄人的高木同學"],
      tags: ["obsidian/project"],
      unrelated: "keep me",
    };
    const file = new TFile();
    file.path = "Anime/Takagi.md";
    file.basename = "Takagi";
    const folder = new TFolder();
    folder.path = "Anime";
    folder.children = [file];
    let refreshed = 0;
    const aniList = result({
      provider: "anilist",
      sourceId: "99468",
      title: "Karakai Jouzu no Takagi-san",
      originalTitle: "からかい上手の高木さん",
      year: 2018,
      genres: [],
    });
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: (path: string) => path === "Anime" ? folder : null,
        },
        metadataCache: { getFileCache: () => ({ frontmatter }) },
        fileManager: {
          processFrontMatter: async (_file: TFile, change: (value: Record<string, unknown>) => void) => change(frontmatter),
        },
      },
      getScanFolders: () => ["Anime"],
      refreshViews: () => { refreshed += 1; },
      searchAniList: async () => [aniList],
    };

    const summary = await migrateMediaClassification(plugin as never);
    assert.deepEqual(summary, {
      scanned: 1,
      changed: 1,
      resolved: 1,
      unresolved: 0,
      removed: 7,
      moved: 0,
    });
    assert.deepEqual(frontmatter.genres, ["喜劇", "戀愛", "日常", "校園"]);
    assert.deepEqual(frontmatter.media_tags, ["我的標籤"]);
    assert.deepEqual(frontmatter.classification_legacy_genres, [
      "戀愛", "日常", "狗糧", "擅長捉弄人的高木同學", "漫畫改", "SHIN_EI", "高橋李依", "赤城博昭",
    ]);
    assert.deepEqual(frontmatter.classification_legacy_media_tags, ["我的標籤", "2018", "擅長捉弄人的高木同學"]);
    assert.equal(frontmatter.classification_source_provider, "anilist");
    assert.equal(frontmatter.classification_source_id, "99468");
    assert.equal(frontmatter.classification_version, 4);
    assert.deepEqual(frontmatter.tags, ["obsidian/project"]);
    assert.equal(frontmatter.unrelated, "keep me");
    assert.equal(refreshed, 1);
  } finally {
    setRequestUrlMock(null);
  }
});
