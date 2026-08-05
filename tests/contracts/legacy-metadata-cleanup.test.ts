import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile } from "obsidian";
import type { ExternalMediaResult } from "../../src/domain/media-types";
import {
  cleanupLegacyMediaFrontmatter,
  cleanupLegacyMetadataNotes,
} from "../../src/data/legacy-metadata-cleanup";
import { createLegacyMetadataSettingsSection } from "../../src/legacy-metadata-settings";
import { legacyMetadataText } from "../../src/legacy-metadata-text";
import { legacyMetadataDetailReport } from "../../src/legacy-metadata-report";
import type { AnimeListFeatureHost } from "../../src/app/feature-types";

const pollutedStudio = "CloverWorks、「ホリミヤ」製作委員会（Aniplex、マイシアターD.D.、毎日放送、スクウェア・エニックス、鐘通インベストメント、グローバル・ソリューションズ、ムービック、未来工場）岩上敦宏、石井紹良、丸山博雄、橋本真司、松井宏記、高麗大助、國枝信吾、近藤尚己";

function classificationResult(source: ExternalMediaResult): ExternalMediaResult {
  return {
    ...source,
    people: ["CloverWorks"],
    sources: [
      ...(source.sources ?? []),
      { provider: "anilist", sourceId: "124080", sourceUrl: "https://anilist.co/anime/124080" },
    ],
    classification: {
      anilistId: "124080",
      genres: ["戀愛", "喜劇"],
      tags: [
        { name: "School", category: "Theme", rank: 90, isGeneralSpoiler: false, isMediaSpoiler: false, isAdult: false },
        { name: "Low", category: "Theme", rank: 40, isGeneralSpoiler: false, isMediaSpoiler: false, isAdult: false },
      ],
      season: "winter",
      seasonYear: 2021,
      studios: ["CloverWorks"],
      source: "manga",
      countryOfOrigin: "JP",
    },
  };
}

describe("legacy metadata cleanup", () => {
  it("repairs the mixed legacy Bangumi metadata example without touching unrelated frontmatter", () => {
    const frontmatter: Record<string, unknown> = {
      schema_version: 6,
      media_type: "anime",
      source_provider: "bangumi",
      title: "堀與宮村",
      genres: ["戀愛", "校園", "CloverWorks", "漫画改", "2021年1月", "狗粮", "TV", "日常", "漫改", "2021", "青春", "戸松遥"],
      source_genres: ["CloverWorks", "漫画改", "2021年1月", "TV", "戸松遥"],
      studios: [pollutedStudio],
      custom_future_field: { keep: true },
    };

    const change = cleanupLegacyMediaFrontmatter(frontmatter);

    assert.equal(change.changed, true);
    assert.equal(change.genres, true);
    assert.equal(change.studios, true);
    assert.deepEqual(frontmatter.genres, ["戀愛", "日常"]);
    assert.equal("source_genres" in frontmatter, false);
    assert.deepEqual(frontmatter.studios, ["CloverWorks"]);
    assert.deepEqual(frontmatter.custom_future_field, { keep: true });
    assert.equal(frontmatter.schema_version, 6);
  });

  it("upgrades a legacy note with current AniList tags, studio, and quarter while preserving unrelated data", async () => {
    const frontmatter: Record<string, unknown> = {
      schema_version: 6,
      media_type: "anime",
      source_provider: "bangumi",
      source_id: "374400",
      source_urls: ["https://bgm.tv/subject/374400"],
      title: "堀與宮村",
      title_original: "ホリミヤ",
      genres: ["戀愛", "CloverWorks", "2021年1月", "TV"],
      studios: [pollutedStudio],
      user_tags: ["重看", "收藏"],
      tags: ["obsidian-project-tag"],
      custom_future_field: { keep: true },
    };
    const file = new TFile();
    file.path = "AnimeList/Anime/Horimiya.md";
    file.basename = "Horimiya";
    file.extension = "md";
    const app = {
      metadataCache: {
        getFileCache: () => ({ frontmatter }),
      },
      vault: { getRoot: () => ({ children: [file] }) },
      fileManager: {
        async processFrontMatter(_file: unknown, callback: (value: Record<string, unknown>) => void) {
          callback(frontmatter);
        },
      },
    } as any;
    const seen: ExternalMediaResult[] = [];
    const progress: string[] = [];
    const result = await cleanupLegacyMetadataNotes(app, [""], {
      apiIntervalMs: 0,
      enrich: async (source) => {
        seen.push(source);
        return classificationResult(source);
      },
      onProgress: (value) => progress.push(`${value.phase}:${value.completed}/${value.total}`),
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.provider, "bangumi");
    assert.equal(result.scanned, 1);
    assert.equal(result.cleaned, 1);
    assert.equal(result.enriched, 1);
    assert.equal(result.classification, 1);
    assert.deepEqual(frontmatter.genres, ["戀愛", "喜劇", "重看", "收藏"]);
    assert.deepEqual(frontmatter.media_tags, ["School"]);
    assert.deepEqual(frontmatter.studios, ["CloverWorks"]);
    assert.equal(frontmatter.season, "winter");
    assert.equal(frontmatter.season_year, 2021);
    assert.equal(frontmatter.source_material, "manga");
    assert.equal("country_of_origin" in frontmatter, false);
    assert.equal(frontmatter.anilist_id, "124080");
    assert.equal(frontmatter.schema_version, 6);
    assert.equal("user_tags" in frontmatter, false);
    assert.deepEqual(frontmatter.tags, ["obsidian-project-tag"]);
    assert.deepEqual(frontmatter.custom_future_field, { keep: true });
    assert.ok((frontmatter.source_urls as string[]).includes("https://bgm.tv/subject/374400"));
    assert.ok((frontmatter.source_urls as string[]).includes("https://anilist.co/anime/124080"));
    assert.ok(progress.some((value) => value.startsWith("enriching:")));
    assert.ok(progress.some((value) => value === "completed:1/1"));
    assert.equal(result.details.length, 1);
    assert.deepEqual(result.details[0], {
      title: "堀與宮村",
      path: "AnimeList/Anime/Horimiya.md",
      changes: [
        "genres",
        "studios",
        "user_tags",
        "media_tags",
        "season",
        "season_year",
        "source_material",
        "anilist_id",
        "source_urls",
      ],
      enrichment: "enriched",
    });
    assert.match(legacyMetadataDetailReport(result), /堀與宮村 .*changed: genres, studios, user_tags, media_tags, season, season_year/);

    let secondPassApiCalls = 0;
    const secondPass = await cleanupLegacyMetadataNotes(app, [""], {
      apiIntervalMs: 0,
      enrich: async (source) => { secondPassApiCalls += 1; return classificationResult(source); },
    });
    assert.equal(secondPassApiCalls, 0);
    assert.equal(secondPass.cleaned, 0);
  });

  it("preserves stable v1.2.1 source fields and personal/unknown frontmatter during enrichment", async () => {
    const frontmatter: Record<string, unknown> = {
      schema_version: 6,
      title: "Legacy anime",
      title_original: "旧作",
      media_type: "anime",
      format: "tv",
      status: "planned",
      progress: 0,
      progress_total: 12,
      progress_unit: "episode",
      favorite: false,
      year: 2021,
      cover: "![[AnimeList/Covers/legacy.jpg|260]]",
      cover_remote: "https://example.com/legacy.jpg",
      genres: ["Romance"],
      source_genres: ["School"],
      studios: ["Legacy Studio"],
      platforms: ["TV"],
      source_provider: "bangumi",
      source_id: "123",
      source_urls: ["https://bgm.tv/subject/123"],
      source_score: 7.8,
      note_template: "AnimeList/Templates/anime.md",
      user_tags: ["重看"],
      tags: ["obsidian-project-tag"],
      custom_future_field: { keep: [1, 2, 3] },
    };
    const file = new TFile();
    file.path = "AnimeList/Anime/legacy-v121.md";
    file.basename = "legacy-v121";
    file.extension = "md";
    let bodyModifyCalls = 0;
    const app = {
      metadataCache: { getFileCache: () => ({ frontmatter }) },
      vault: {
        getRoot: () => ({ children: [file] }),
        modify: async () => { bodyModifyCalls += 1; },
      },
      fileManager: {
        async processFrontMatter(_file: unknown, callback: (value: Record<string, unknown>) => void) {
          callback(frontmatter);
        },
      },
    } as any;

    const result = await cleanupLegacyMetadataNotes(app, [""], {
      apiIntervalMs: 0,
      enrich: async (source) => classificationResult(source),
    });

    assert.equal(result.enriched, 1);
    assert.equal(bodyModifyCalls, 0);
    assert.equal(frontmatter.schema_version, 6);
    assert.equal(frontmatter.title_original, "旧作");
    assert.equal(frontmatter.format, "tv");
    assert.equal(frontmatter.status, "planned");
    assert.equal(frontmatter.progress, 0);
    assert.equal(frontmatter.progress_total, 12);
    assert.equal(frontmatter.progress_unit, "episode");
    assert.equal(frontmatter.favorite, false);
    assert.equal(frontmatter.year, 2021);
    assert.equal(frontmatter.cover, "![[AnimeList/Covers/legacy.jpg|260]]");
    assert.equal(frontmatter.cover_remote, "https://example.com/legacy.jpg");
    assert.deepEqual(frontmatter.platforms, ["TV"]);
    assert.equal(frontmatter.source_provider, "bangumi");
    assert.equal(frontmatter.source_id, "123");
    assert.equal(frontmatter.source_score, 7.8);
    assert.equal(frontmatter.note_template, "AnimeList/Templates/anime.md");
    assert.equal("user_tags" in frontmatter, false);
    assert.deepEqual(frontmatter.genres, ["戀愛", "喜劇", "重看"]);
    assert.deepEqual(frontmatter.tags, ["obsidian-project-tag"]);
    assert.deepEqual(frontmatter.custom_future_field, { keep: [1, 2, 3] });
    assert.ok((frontmatter.source_urls as string[]).includes("https://bgm.tv/subject/123"));
    assert.ok((frontmatter.source_urls as string[]).includes("https://anilist.co/anime/124080"));
  });

  it("does not mark a legacy note current when AniList metadata is unavailable, allowing a later retry", async () => {
    const frontmatter: Record<string, unknown> = {
      schema_version: 6,
      media_type: "anime",
      source_provider: "bangumi",
      source_id: "1",
      title: "Unknown work",
      genres: ["戀愛"],
      studios: ["Studio"],
    };
    const file = new TFile();
    file.path = "AnimeList/Anime/Unknown.md";
    file.basename = "Unknown";
    file.extension = "md";
    const app = {
      metadataCache: { getFileCache: () => ({ frontmatter }) },
      vault: { getRoot: () => ({ children: [file] }) },
      fileManager: { async processFrontMatter(_file: unknown, callback: (value: Record<string, unknown>) => void) { callback(frontmatter); } },
    } as any;
    const result = await cleanupLegacyMetadataNotes(app, [""], {
      apiIntervalMs: 0,
      enrich: async (source) => source,
    });
    assert.equal(result.unavailable, 1);
    assert.equal(frontmatter.schema_version, 6);
    assert.deepEqual(result.details, [{
      title: "Unknown work",
      path: "AnimeList/Anime/Unknown.md",
      changes: [],
      enrichment: "unavailable",
    }]);
    assert.match(legacyMetadataDetailReport(result), /Unknown work .*AniList: no reliable match/);
  });

  it("uses English Settings copy and opens the progress workflow", () => {
    const host = {
      app: {},
      getScanFolders: () => ["AnimeList"],
      refreshViews: () => undefined,
      enrichExternalMedia: async (result: ExternalMediaResult) => result,
    } as unknown as AnimeListFeatureHost;
    let opened = 0;
    const section = createLegacyMetadataSettingsSection(host, () => { opened += 1; });
    assert.equal(section.heading, "Legacy metadata cleanup");
    assert.match(section.description ?? "", /current metadata schema/i);
    assert.equal(legacyMetadataText("settings.button"), "Scan and upgrade");

    const definition = section.definitions[0];
    if (!definition?.render) throw new Error("Legacy cleanup setting is not renderable");
    let handler: (() => void | Promise<void>) | undefined;
    const setting = {
      addButton(callback: (button: {
        setButtonText(value: string): unknown;
        setCta(): unknown;
        onClick(value: () => void | Promise<void>): unknown;
      }) => void) {
        callback({
          setButtonText: () => undefined,
          setCta: () => undefined,
          onClick: (value) => { handler = value; },
        });
      },
    };
    definition.render(setting as never);
    handler?.();
    assert.equal(opened, 1);
  });
});
