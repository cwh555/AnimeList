import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MediaItem } from "../src/domain/media-types";
import {
  collectLibraryFilterOptions,
  libraryFilterCount,
  libraryItemMatchesFilters,
  libraryQuarterKey,
  normalizeLibraryFilters,
  reconcileLibraryFilters,
  toggleLibraryFilterValue,
  toggleLibraryQuarter,
} from "../src/domain/library-filters";

function mediaItem(overrides: Partial<MediaItem>): MediaItem {
  return {
    title: "Example",
    originalTitle: "",
    mediaType: "anime",
    format: "TV",
    status: "completed",
    releaseStatus: "finished",
    progress: 12,
    total: 12,
    unit: "episode",
    score: 9,
    favorite: false,
    year: 2021,
    genres: [],
    people: [],
    platforms: [],
    sourceUrls: [],
    cover: "",
    filePath: "AnimeList/Anime/example.md",
    updated: 0,
    updatedLabel: "",
    startedAt: "",
    completedAt: "",
    volumeLog: [],
    ...overrides,
  };
}

describe("library filters", () => {
  it("migrates one legacy genre into the canonical tag filter without retaining duplicates", () => {
    assert.deepEqual(normalizeLibraryFilters(undefined, "戀愛"), {
      companies: [],
      quarter: "",
      tags: ["戀愛"],
    });
    assert.deepEqual(normalizeLibraryFilters({ tags: ["戀愛", " 戀愛 ", "校園"] }, "喜劇"), {
      companies: [],
      quarter: "",
      tags: ["戀愛", "校園"],
    });
  });

  it("toggles multi-select chips off when pressed again and keeps quarter single-select", () => {
    assert.deepEqual(toggleLibraryFilterValue([], "CloverWorks"), ["CloverWorks"]);
    assert.deepEqual(toggleLibraryFilterValue(["CloverWorks", "A-1 Pictures"], "CloverWorks"), ["A-1 Pictures"]);
    assert.equal(toggleLibraryQuarter("", "2021:winter"), "2021:winter");
    assert.equal(toggleLibraryQuarter("2021:winter", "2021:winter"), "");
    assert.equal(toggleLibraryQuarter("2021:winter", "2022:spring"), "2022:spring");
  });

  it("extracts only anime companies while keeping shared tags and descending quarters", () => {
    const options = collectLibraryFilterOptions([
      mediaItem({ people: ["CloverWorks"], genres: ["戀愛", "校園"], season: "winter", seasonYear: 2021 }),
      mediaItem({ people: ["A-1 Pictures"], genres: ["奇幻"], season: "fall", seasonYear: 2023 }),
      mediaItem({ mediaType: "manga", people: ["荒川弘"], genres: ["校園"] }),
    ]);

    assert.deepEqual(options.companies, ["A-1 Pictures", "CloverWorks"]);
    assert.deepEqual(options.quarters.map((option) => option.key), ["2023:fall", "2021:winter"]);
    assert.deepEqual(options.tags, ["奇幻", "校園", "戀愛"]);
    assert.equal(options.companies.includes("荒川弘"), false);
  });

  it("requires every selected company and tag plus the exact selected quarter", () => {
    const item = mediaItem({
      people: ["CloverWorks", "A-1 Pictures"],
      genres: ["戀愛", "校園", "喜劇"],
      season: "winter",
      seasonYear: 2021,
    });
    const filters = {
      companies: ["CloverWorks", "A-1 Pictures"],
      quarter: libraryQuarterKey("winter", 2021),
      tags: ["戀愛", "校園"],
    };

    assert.equal(libraryFilterCount(filters), 5);
    assert.equal(libraryItemMatchesFilters(item, filters), true);
    assert.equal(libraryItemMatchesFilters(item, { ...filters, companies: [...filters.companies, "ufotable"] }), false);
    assert.equal(libraryItemMatchesFilters(item, { ...filters, quarter: libraryQuarterKey("spring", 2021) }), false);
    assert.equal(libraryItemMatchesFilters(item, { ...filters, tags: [...filters.tags, "動作"] }), false);
  });

  it("never matches manga or novel items when an anime-only company or quarter filter is active", () => {
    const manga = mediaItem({ mediaType: "manga", people: ["CloverWorks"], genres: ["戀愛"] });
    assert.equal(libraryItemMatchesFilters(manga, { companies: ["CloverWorks"], quarter: "", tags: [] }), false);
    assert.equal(libraryItemMatchesFilters(manga, { companies: [], quarter: "2021:winter", tags: [] }), false);
  });

  it("drops persisted filters that no longer exist after metadata normalization", () => {
    const filters = normalizeLibraryFilters({
      companies: ["制作:ジェンコ", "Studio DEEN"],
      quarter: "2024:spring",
      tags: ["舊標籤", "戀愛"],
    });
    assert.deepEqual(reconcileLibraryFilters(filters, {
      companies: ["Studio DEEN"],
      quarters: [{ key: "2025:winter", season: "winter", year: 2025 }],
      tags: ["戀愛"],
    }), {
      companies: ["Studio DEEN"],
      quarter: "",
      tags: ["戀愛"],
    });
  });

});
