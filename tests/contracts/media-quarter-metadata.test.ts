import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile } from "obsidian";
import {
  normalizeAniListClassification,
  resolveMediaSeasonMetadata,
} from "../../src/domain/media-classification";
import { editableMediaQuarterText, parseEditableMediaQuarter, parseEditableMediaQuarterText } from "../../src/domain/media-quarter";
import type { ExternalMediaResult, MediaNoteForm } from "../../src/domain/media-types";
import { applyEditableMediaForm, buildMediaMarkdown } from "../../src/data/media-note-codec";
import { cleanupLegacyMetadataNotes } from "../../src/data/legacy-metadata-cleanup";
import { mediaClassificationFieldValues } from "../../src/ui/media-classification-fields";
import { mediaQuarterLabel } from "../../src/ui/media-quarter-label";

function animeResult(overrides: Partial<ExternalMediaResult> = {}): ExternalMediaResult {
  return {
    provider: "bangumi",
    sourceId: "bgm-quarter",
    sourceUrl: "https://bgm.tv/subject/quarter",
    mediaType: "anime",
    title: "Quarter test",
    originalTitle: "Quarter test",
    romajiTitle: "Quarter test",
    format: "tv",
    year: 2025,
    coverUrl: "",
    genres: ["戀愛"],
    rawGenres: ["戀愛"],
    people: ["Studio"],
    platforms: [],
    total: 24,
    unit: "episode",
    summary: "",
    externalScore: null,
    releaseStatus: "releasing",
    searchTitles: ["Quarter test"],
    sources: [{ provider: "bangumi", sourceId: "bgm-quarter", sourceUrl: "https://bgm.tv/subject/quarter" }],
    ...overrides,
  };
}

function animeForm(overrides: Partial<MediaNoteForm> = {}): MediaNoteForm {
  return {
    title: "Quarter test",
    score: null,
    status: "ongoing",
    releaseStatus: "unknown",
    startedAt: "",
    completedAt: "",
    progress: 14,
    total: 24,
    unit: "episode",
    favorite: false,
    genres: ["戀愛"],
    templatePath: "",
    volumeLog: [],
    ...overrides,
  };
}

function noteFrontmatter(markdown: string): string {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "generated note must start with YAML frontmatter");
  return match[1];
}

describe("anime calendar quarter metadata", () => {
  it("uses actual start month ahead of provider season buckets", () => {
    const metadata = resolveMediaSeasonMetadata({
      season: "spring",
      seasonYear: 2024,
      startDate: { year: 2024, month: 3, day: 31 },
    });
    assert.deepEqual(metadata, { season: "winter", seasonYear: 2024 });

    const classification = normalizeAniListClassification({
      id: 42,
      genres: [],
      tags: [],
      studios: { nodes: [] },
      season: "SPRING",
      seasonYear: 2024,
      startDate: { year: 2024, month: 3, day: 31 },
      source: "ORIGINAL",
      countryOfOrigin: "JP",
    });
    assert.equal(classification?.season, "winter");
    assert.equal(classification?.seasonYear, 2024);
  });

  it("uses provider season only when the actual start month is unavailable", () => {
    assert.deepEqual(resolveMediaSeasonMetadata({
      season: "summer",
      seasonYear: 2025,
      startDate: { year: 2025, month: null, day: null },
    }), { season: "summer", seasonYear: 2025 });
  });

  it("accepts only a complete four-digit year plus Q1-Q4 quarter", () => {
    assert.deepEqual(parseEditableMediaQuarter("Q1", "2025"), {
      kind: "valid",
      season: "winter",
      seasonYear: 2025,
    });
    assert.deepEqual(parseEditableMediaQuarter("fall", 2026), {
      kind: "valid",
      season: "fall",
      seasonYear: 2026,
    });
    assert.deepEqual(parseEditableMediaQuarter("", ""), { kind: "empty" });
    assert.deepEqual(parseEditableMediaQuarter("Q3", "25"), { kind: "invalid" });
    assert.deepEqual(parseEditableMediaQuarter("Q5", "2025"), { kind: "invalid" });
    assert.deepEqual(parseEditableMediaQuarter("", "2025"), { kind: "invalid" });
  });

  it("uses one canonical YYYY Qn text contract for the editable top metadata field", () => {
    assert.equal(editableMediaQuarterText("fall", 2022), "2022 Q4");
    assert.deepEqual(parseEditableMediaQuarterText("2026 Q3"), {
      kind: "valid",
      season: "summer",
      seasonYear: 2026,
    });
    assert.deepEqual(parseEditableMediaQuarterText("2026Q3"), { kind: "invalid" });
    assert.deepEqual(parseEditableMediaQuarterText("26 Q3"), { kind: "invalid" });
  });

  it("keeps UI quarter display aligned with calendar start month and hides year-only pseudo-quarters", () => {
    const result = animeResult({
      startDate: { year: 2025, month: 3, day: 31 },
      classification: {
        anilistId: "42",
        genres: ["戀愛"],
        tags: [],
        season: "spring",
        seasonYear: 2025,
        studios: ["Studio"],
        source: "original",
        countryOfOrigin: "JP",
      },
    });
    const quarter = mediaClassificationFieldValues(result).find((row) => row.key === "season");
    assert.equal(quarter?.value, "2025 Q1 (冬季)");
    assert.equal(mediaQuarterLabel(null, 2025), "");
  });

  it("persists quarter from provider startDate even without AniList classification", () => {
    const markdown = buildMediaMarkdown(animeResult({
      startDate: { year: 2025, month: 7, day: 4 },
      classification: undefined,
    }), animeForm({ title: "Cross-season show" }), "", "");
    const yaml = noteFrontmatter(markdown);
    assert.match(yaml, /^season: "summer"$/m);
    assert.match(yaml, /^season_year: 2025$/m);
  });

  it("lets an explicit manual quarter override complete provider metadata", () => {
    const markdown = buildMediaMarkdown(animeResult({
      startDate: { year: 2025, month: 1, day: 4 },
      classification: {
        anilistId: "42",
        genres: ["戀愛"],
        tags: [],
        season: "winter",
        seasonYear: 2025,
        studios: ["Studio"],
        source: "original",
        countryOfOrigin: "JP",
      },
    }), animeForm({ season: "Q3", seasonYear: "2026" }), "", "");
    const yaml = noteFrontmatter(markdown);
    assert.match(yaml, /^season: "summer"$/m);
    assert.match(yaml, /^season_year: 2026$/m);
  });

  it("updates only canonical quarter fields when an edit supplies a manual override", () => {
    const frontmatter: Record<string, unknown> = {
      schema_version: 6,
      title: "Quarter test",
      status: "ongoing",
      progress: 5,
      progress_total: 12,
      progress_unit: "episode",
      favorite: false,
      season: "winter",
      season_year: 2025,
      source_urls: ["https://example.com/source"],
      custom_field: "keep-me",
    };
    applyEditableMediaForm(frontmatter, "anime", animeForm({
      season: "fall",
      seasonYear: 2026,
      progress: 6,
      total: 12,
    }));
    assert.equal(frontmatter.season, "fall");
    assert.equal(frontmatter.season_year, 2026);
    assert.deepEqual(frontmatter.source_urls, ["https://example.com/source"]);
    assert.equal(frontmatter.custom_field, "keep-me");
  });

  it("lets manual format and studio values override provider metadata without touching unrelated fields", () => {
    const frontmatter: Record<string, unknown> = {
      schema_version: 6,
      title: "Quarter test",
      media_type: "anime",
      format: "tv",
      studios: ["Provider Studio"],
      status: "ongoing",
      progress: 5,
      progress_total: 12,
      progress_unit: "episode",
      favorite: false,
      source_urls: ["https://example.com/source"],
      custom_field: "keep-me",
    };
    applyEditableMediaForm(frontmatter, "anime", animeForm({
      format: "movie",
      studios: ["CloverWorks"],
      progress: 6,
      total: 12,
    }));
    assert.equal(frontmatter.format, "movie");
    assert.deepEqual(frontmatter.studios, ["CloverWorks"]);
    assert.deepEqual(frontmatter.source_urls, ["https://example.com/source"]);
    assert.equal(frontmatter.custom_field, "keep-me");
  });

  it("does not rewrite format or studios when those edit controls were not changed", () => {
    const frontmatter: Record<string, unknown> = {
      schema_version: 6,
      title: "Quarter test",
      media_type: "anime",
      format: "custom-provider-format",
      studios: ["Provider Studio"],
      status: "ongoing",
      progress: 5,
      progress_total: 12,
      progress_unit: "episode",
      favorite: false,
    };
    applyEditableMediaForm(frontmatter, "anime", animeForm({ progress: 6, total: 12 }));
    assert.equal(frontmatter.format, "custom-provider-format");
    assert.deepEqual(frontmatter.studios, ["Provider Studio"]);
  });

  it("writes manual format, studio, and quarter values into a newly collected provider result", () => {
    const markdown = buildMediaMarkdown(
      animeResult({ format: "tv", people: ["Provider Studio"] }),
      animeForm({
        format: "ova",
        studios: ["CloverWorks"],
        season: "Q2",
        seasonYear: "2026",
      }),
      "",
      "",
    );
    const yaml = noteFrontmatter(markdown);
    assert.match(yaml, /^format: "ova"$/m);
    assert.match(yaml, /^studios:\n  - "CloverWorks"$/m);
    assert.match(yaml, /^season: "spring"$/m);
    assert.match(yaml, /^season_year: 2026$/m);
  });

  it("rejects a partial manual quarter instead of writing malformed YAML", () => {
    assert.throws(() => buildMediaMarkdown(
      animeResult(),
      animeForm({ season: "summer", seasonYear: "20" }),
      "",
      "",
    ), /Q1–Q4/);
  });

  it("backfills a missing quarter when an old note already has only season_year", async () => {
    const frontmatter: Record<string, unknown> = {
      schema_version: 6,
      media_type: "anime",
      source_provider: "bangumi",
      source_id: "quarter-only",
      source_urls: ["https://bgm.tv/subject/quarter-only"],
      anilist_id: "12345",
      title: "Cross-season show",
      year: 2025,
      season_year: 2025,
      genres: ["戀愛"],
      studios: ["Studio"],
    };
    const file = new TFile();
    file.path = "AnimeList/Anime/Cross-season show.md";
    file.basename = "Cross-season show";
    file.extension = "md";
    const app = {
      metadataCache: { getFileCache: () => ({ frontmatter }) },
      vault: { getRoot: () => ({ children: [file] }) },
      fileManager: {
        async processFrontMatter(_file: unknown, callback: (value: Record<string, unknown>) => void) {
          callback(frontmatter);
        },
      },
    } as any;

    const result = await cleanupLegacyMetadataNotes(app, [""], {
      apiIntervalMs: 0,
      enrich: async (source) => ({
        ...source,
        startDate: { year: 2025, month: 10, day: 3 },
      }),
    });

    assert.equal(frontmatter.season, "fall");
    assert.equal(frontmatter.season_year, 2025);
    assert.deepEqual(result.details[0]?.changes, ["season"]);
  });
});
