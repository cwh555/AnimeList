import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classificationFromAniListMedia,
  mergeAniListClassifications,
} from "../src/anilist-classification";
import { CLASSIFICATION_TEXT } from "../src/classification-feature-text";
import {
  automaticClassificationForResult,
  migrateClassificationFrontmatter,
  storedClassificationSelection,
} from "../src/classification-compatibility";
import { classificationMetadataForResult } from "../src/classification-ui";
import {
  attachAniListGenres,
  attachAniListTags,
  classificationSuggestions,
  normalizeAutomaticValues,
} from "../src/media-classification";
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
    genres: [],
    tags: [],
    rawGenres: [],
    rawTags: [],
    people: [],
    platforms: [],
    sourceUrl: "https://anilist.co/anime/99468",
    coverUrl: "",
    summary: "",
    externalScore: 7.4,
    releaseStatus: "finished",
    ...overrides,
  };
}

const takagiTags = [
  { name: "Primarily Child Cast", rank: 96 },
  { name: "Heterosexual", rank: 96 },
  { name: "School", rank: 82 },
  { name: "Slapstick", rank: 80 },
  { name: "Ensemble Cast", rank: 79 },
  { name: "Episodic", rank: 75 },
  { name: "Shounen", rank: 63 },
  { name: "Male Protagonist", rank: 60 },
  { name: "Female Protagonist", rank: 60 },
];

describe("media classification", () => {
  it("classifies the Takagi-san AniList case without title, staff, studio, or adaptation pollution", () => {
    const classification = classificationFromAniListMedia({
      id: 99468,
      genres: ["Comedy", "Romance", "Slice of Life"],
      tags: takagiTags,
      startDate: { year: 2018 },
      studios: { nodes: [{ name: "Shin-Ei Animation" }] },
    });
    assert.deepEqual(classification.genres, ["喜劇", "戀愛", "日常", "校園"]);
    assert.deepEqual(classification.tags, ["鬧劇", "群像", "單元劇"]);
    assert.equal(classification.year, 2018);
    assert.deepEqual(classification.people, ["Shin-Ei Animation"]);
  });

  it("promotes broad AniList tags such as School into classifications", () => {
    assert.deepEqual(
      attachAniListGenres(["Romance", "Slice of Life"], [{ name: "School", rank: 82 }]),
      ["戀愛", "日常", "校園"],
    );
    assert.deepEqual(attachAniListTags([{ name: "School", rank: 82 }]), []);
  });

  it("keeps only reviewed descriptive tags", () => {
    assert.deepEqual(attachAniListTags(takagiTags), ["鬧劇", "群像", "單元劇"]);
  });

  it("never treats unknown provider metadata as automatic custom classifications", () => {
    assert.deepEqual(
      normalizeAutomaticValues([
        "戀愛", "日常", "狗糧", "擅長捉弄人的高木同學", "漫畫改",
        "SHIN_EI", "漫改", "高橋李依", "赤城博昭",
      ], "genre"),
      ["戀愛", "日常"],
    );
  });

  it("does not automatically classify Bangumi or OpenLibrary results", () => {
    const polluted = [
      "戀愛", "日常", "狗糧", "擅長捉弄人的高木同學", "漫畫改",
      "SHIN_EI", "漫改", "高橋李依", "赤城博昭",
    ];
    assert.deepEqual(automaticClassificationForResult(result({ provider: "bangumi", genres: polluted })), {
      genres: [],
      tags: [],
    });
    assert.deepEqual(automaticClassificationForResult(result({ provider: "openlibrary", genres: polluted })), {
      genres: [],
      tags: [],
    });
  });

  it("uses strict catalog fallback if AniList enrichment is unavailable", () => {
    const source = result({
      genres: ["Romance", "Slice of Life", "擅長捉弄人的高木同學", "SHIN_EI"],
      tags: ["School", "Heterosexual"],
    });
    const [merged] = mergeAniListClassifications([source], new Map());
    assert.deepEqual(merged?.genres, ["戀愛", "日常"]);
    assert.deepEqual(merged?.tags, []);
  });

  it("uses the exact ID enrichment result when available", () => {
    const source = result({ genres: ["garbage"] });
    const [merged] = mergeAniListClassifications([source], new Map([["99468", {
      genres: ["喜劇", "戀愛", "日常", "校園"],
      tags: ["鬧劇", "群像", "單元劇"],
      year: 2018,
      people: ["Shin-Ei Animation"],
    }]]));
    assert.deepEqual(merged?.genres, ["喜劇", "戀愛", "日常", "校園"]);
    assert.deepEqual(merged?.tags, ["鬧劇", "群像", "單元劇"]);
    assert.deepEqual(merged?.people, ["Shin-Ei Animation"]);
  });

  it("does not spread legacy vault pollution through suggestions", () => {
    const genres = classificationSuggestions("genre");
    assert.ok(genres.includes("校園"));
    assert.ok(!genres.includes("擅長捉弄人的高木同學"));
    assert.ok(!genres.includes("SHIN_EI"));
  });

  it("keeps existing custom values before the explicit migration action", () => {
    assert.deepEqual(storedClassificationSelection({
      genres: ["戀愛", "使用者自訂分類", "擅長捉弄人的高木同學"],
      media_tags: ["使用者自訂標籤"],
    }), {
      genres: ["戀愛", "使用者自訂分類", "擅長捉弄人的高木同學"],
      tags: ["使用者自訂標籤"],
    });
  });

  it("cleans clear legacy pollution only when migration is explicitly run and creates backups", () => {
    const frontmatter: Record<string, unknown> = {
      title: "擅長捉弄人的高木同學",
      year: 2018,
      media_type: "anime",
      source_provider: "bangumi",
      people: ["高橋李依", "赤城博昭"],
      genres: [
        "戀愛", "日常", "校園", "狗糧", "擅長捉弄人的高木同學",
        "漫畫改", "SHIN_EI", "高橋李依", "赤城博昭", "使用者自訂分類",
      ],
      media_tags: ["單元劇"],
      tags: ["obsidian-project-tag"],
      unrelated: true,
    };
    const cleanup = migrateClassificationFrontmatter(frontmatter, "擅長捉弄人的高木同學");
    assert.deepEqual(cleanup.genres, ["戀愛", "日常", "校園", "狗糧", "SHIN_EI", "使用者自訂分類"]);
    assert.deepEqual(cleanup.tags, ["單元劇"]);
    assert.ok(cleanup.removed.includes("擅長捉弄人的高木同學"));
    assert.ok(cleanup.removed.includes("漫畫改"));
    assert.ok(cleanup.removed.includes("高橋李依"));
    assert.ok(cleanup.removed.includes("赤城博昭"));
    assert.deepEqual(frontmatter.classification_legacy_genres, [
      "戀愛", "日常", "校園", "狗糧", "擅長捉弄人的高木同學",
      "漫畫改", "SHIN_EI", "高橋李依", "赤城博昭", "使用者自訂分類",
    ]);
    assert.deepEqual(frontmatter.tags, ["obsidian-project-tag"]);
    assert.equal(frontmatter.unrelated, true);
  });

  it("keeps year and studio in separate metadata fields", () => {
    assert.deepEqual(classificationMetadataForResult(result({ people: ["Shin-Ei Animation"] })), [
      { label: "年份", value: "2018" },
      { label: "製作公司", value: "Shin-Ei Animation" },
    ]);
  });

  it("uses English-only text in the classification settings section", () => {
    const settingsText = Object.entries(CLASSIFICATION_TEXT)
      .filter(([key]) => key.startsWith("settings."))
      .map(([, value]) => value)
      .join(" ");
    assert.match(settingsText, /Media classification/);
    assert.match(settingsText, /Clean up legacy/);
    assert.doesNotMatch(settingsText, /[\u3400-\u9fff]/u);
  });
});
