import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanupLegacyMediaFrontmatter,
} from "../../src/data/legacy-metadata-cleanup";
import { createLegacyMetadataSettingsSection } from "../../src/legacy-metadata-settings";
import type { AnimeListFeatureHost } from "../../src/app/feature-types";

const pollutedStudio = "CloverWorks、「ホリミヤ」製作委員会（Aniplex、マイシアターD.D.、毎日放送、スクウェア・エニックス、鐘通インベストメント、グローバル・ソリューションズ、ムービック、未来工場）岩上敦宏、石井紹良、丸山博雄、橋本真司、松井宏記、高麗大助、國枝信吾、近藤尚己";

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
  });

  it("is idempotent and leaves unrelated providers and user genres alone", () => {
    const frontmatter: Record<string, unknown> = {
      schema_version: 6,
      media_type: "anime",
      source_provider: "anilist",
      genres: ["校園", "異世界", "青春"],
      studios: ["CloverWorks"],
    };
    assert.equal(cleanupLegacyMediaFrontmatter(frontmatter).changed, false);
    assert.deepEqual(frontmatter.genres, ["校園", "異世界", "青春"]);
    assert.deepEqual(frontmatter.studios, ["CloverWorks"]);
  });

  it("exposes one-click automatic cleanup from Settings", async () => {
    let calls = 0;
    const host = {
      app: {},
      getScanFolders: () => ["AnimeList"],
      refreshViews: () => undefined,
    } as unknown as AnimeListFeatureHost;
    const section = createLegacyMetadataSettingsSection(host, async (_app, roots) => {
      calls += 1;
      assert.deepEqual(roots, ["AnimeList"]);
      return { scanned: 12, cleaned: 3, genres: 2, sourceGenres: 1, studios: 2 };
    });
    assert.equal(section.definitions.length, 1);
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
    assert.ok(handler);
    await handler?.();
    assert.equal(calls, 1);
  });
});
