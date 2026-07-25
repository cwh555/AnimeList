import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classificationFromAniListMedia } from "../src/anilist-classification";
import { applyResolvedMediaMetadata } from "../src/classification-create-persistence";
import {
  clearClassificationCreateDraft,
  getClassificationCreateDraft,
  setClassificationCreateDraft,
} from "../src/classification-create-state";
import { applyCanonicalMigrationMetadata } from "../src/classification-migration";
import { classificationMetadataForResult } from "../src/classification-ui";
import { releaseDateMetadata, releaseSeasonLabel } from "../src/release-season";
import type { ExternalMediaResult } from "../src/types";

function result(overrides: Partial<ExternalMediaResult> = {}): ExternalMediaResult {
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
    rawGenres: ["Comedy", "Romance", "Slice of Life"],
    rawTags: [],
    people: ["Shin-Ei Animation"],
    platforms: [],
    sourceUrl: "https://anilist.co/anime/99468",
    coverUrl: "",
    summary: "",
    externalScore: null,
    releaseStatus: "finished",
    searchTitles: ["Teasing Master Takagi-san"],
    ...overrides,
  };
}

describe("release season metadata", () => {
  it("normalizes months to seasonal starting months", () => {
    assert.deepEqual(releaseDateMetadata(2026, 1), { year: 2026, season: 1 });
    assert.deepEqual(releaseDateMetadata(2026, 4), { year: 2026, season: 4 });
    assert.deepEqual(releaseDateMetadata(2026, 8), { year: 2026, season: 7 });
    assert.deepEqual(releaseDateMetadata(2026, 12), { year: 2026, season: 10 });
    assert.equal(releaseSeasonLabel(7), "夏季");
  });

  it("shows year, release season, and studio as separate metadata", () => {
    assert.deepEqual(classificationMetadataForResult(result()), [
      { label: "年份", value: "2018" },
      { label: "季度", value: "冬季" },
      { label: "製作公司", value: "Shin-Ei Animation" },
    ]);
  });
});

describe("classification create persistence", () => {
  it("persists canonical classifications for newly created notes", () => {
    const frontmatter: Record<string, unknown> = { genres: [], tags: ["污染值"], year: 0 };
    applyResolvedMediaMetadata(frontmatter, result());
    assert.deepEqual(frontmatter.genres, ["喜劇", "戀愛", "日常", "校園"]);
    assert.equal(frontmatter.media_tags, undefined);
    assert.equal(frontmatter.tags, undefined);
    assert.equal(frontmatter.year, 2018);
    assert.equal(frontmatter.season, 1);
  });

  it("preserves the user's edited genres and custom tags after canonical resolution", () => {
    const selected = result({ provider: "bangumi", sourceId: "218712", genres: [], tags: [] });
    setClassificationCreateDraft(selected, {
      genres: ["喜劇", "戀愛", "自訂分類"],
      tags: ["待重看", "年度推薦"],
    });
    const draft = getClassificationCreateDraft(selected);
    assert.deepEqual(draft, {
      genres: ["喜劇", "戀愛", "自訂分類"],
      tags: ["待重看", "年度推薦"],
    });

    const frontmatter: Record<string, unknown> = { tags: ["legacy"] };
    applyResolvedMediaMetadata(frontmatter, result(), draft ?? { genres: [], tags: [] });
    assert.deepEqual(frontmatter.genres, ["喜劇", "戀愛", "自訂分類"]);
    assert.deepEqual(frontmatter.media_tags, ["待重看", "年度推薦"]);
    assert.equal(frontmatter.tags, undefined);
    assert.equal(frontmatter.year, 2018);
    assert.equal(frontmatter.season, 1);

    clearClassificationCreateDraft(selected);
    assert.equal(getClassificationCreateDraft(selected), null);
  });

  it("returns cloned draft values so callers cannot mutate stored state", () => {
    const selected = result();
    setClassificationCreateDraft(selected, { genres: ["喜劇"], tags: ["自訂"] });
    const first = getClassificationCreateDraft(selected);
    first?.genres.push("污染");
    assert.deepEqual(getClassificationCreateDraft(selected), { genres: ["喜劇"], tags: ["自訂"] });
    clearClassificationCreateDraft(selected);
  });
});

describe("representative AniList classifications", () => {
  it("maps several works with different genre and promoted-tag combinations", () => {
    const samples = [
      {
        name: "擅長捉弄人的高木同學",
        media: {
          genres: ["Comedy", "Romance", "Slice of Life"],
          tags: [{ name: "School", rank: 82 }],
          startDate: { year: 2018, month: 1 },
          studios: { nodes: [{ name: "Shin-Ei Animation" }] },
        },
        expected: { genres: ["喜劇", "戀愛", "日常", "校園"], season: 1 },
      },
      {
        name: "葬送的芙莉蓮",
        media: {
          genres: ["Adventure", "Drama", "Fantasy"],
          tags: [{ name: "Magic", rank: 91 }, { name: "Elf", rank: 96 }],
          startDate: { year: 2023, month: 9 },
          studios: { nodes: [{ name: "MADHOUSE" }] },
        },
        expected: { genres: ["冒險", "劇情", "奇幻", "魔法"], season: 7 },
      },
      {
        name: "輝夜姬想讓人告白",
        media: {
          genres: ["Comedy", "Psychological", "Romance"],
          tags: [{ name: "School", rank: 88 }, { name: "Primarily Teen Cast", rank: 95 }],
          startDate: { year: 2019, month: 1 },
          studios: { nodes: [{ name: "A-1 Pictures" }] },
        },
        expected: { genres: ["喜劇", "心理", "戀愛", "校園"], season: 1 },
      },
      {
        name: "藥師少女的獨語",
        media: {
          genres: ["Drama", "Mystery"],
          tags: [{ name: "Historical", rank: 89 }, { name: "Medicine", rank: 97 }],
          startDate: { year: 2023, month: 10 },
          studios: { nodes: [{ name: "TOHO animation STUDIO" }] },
        },
        expected: { genres: ["劇情", "懸疑", "歷史"], season: 10 },
      },
    ] as const;

    for (const sample of samples) {
      const classification = classificationFromAniListMedia(sample.media);
      assert.deepEqual(classification.genres, sample.expected.genres, sample.name);
      assert.equal(classification.season, sample.expected.season, sample.name);
      assert.deepEqual(classification.tags, [], sample.name);
    }
  });
});

describe("classification migration", () => {
  it("rebuilds legacy genres while preserving custom media tags and unrelated data", () => {
    const frontmatter: Record<string, unknown> = {
      genres: ["Comedy", "2018", "TV", "錯誤資料"],
      media_tags: ["我的標籤"],
      title: "擅長捉弄人的高木同學",
      custom_field: "preserve me",
    };
    applyCanonicalMigrationMetadata(frontmatter, result(), "擅長捉弄人的高木同學");
    assert.deepEqual(frontmatter.genres, ["喜劇", "戀愛", "日常", "校園"]);
    assert.deepEqual(frontmatter.media_tags, ["我的標籤"]);
    assert.equal(frontmatter.custom_field, "preserve me");
    assert.equal(frontmatter.year, 2018);
    assert.equal(frontmatter.season, 1);
    assert.deepEqual(frontmatter.classification_legacy_genres, ["Comedy", "2018", "TV", "錯誤資料"]);
  });
});
