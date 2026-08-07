import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App, TFile } from "obsidian";
import { SpecialLabelStateService } from "../../src/data/special-label-state-service";

function mediaFile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.basename = path.split("/").at(-1)?.replace(/\.md$/, "") ?? "media";
  return file;
}

describe("special label state service", () => {
  it("updates favorite state through one persistence path and preserves labels", async () => {
    const file = mediaFile("AnimeList/Anime/example.md");
    const frontmatter: Record<string, unknown> = {
      media_type: "anime",
      favorite: false,
      masterpiece_labels: ["visual"],
      updated_at: "legacy",
      metadata_updated_at: "legacy",
      custom: { keep: true },
    };
    let refreshes = 0;
    const app = {
      vault: { getAbstractFileByPath: (path: string) => path === file.path ? file : null },
      fileManager: {
        processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => update(frontmatter),
      },
    } as unknown as App;

    await new SpecialLabelStateService(app, { refreshViews: () => { refreshes += 1; } })
      .setFavorite(file.path, true);

    assert.deepEqual(frontmatter, {
      media_type: "anime",
      favorite: true,
      masterpiece_labels: ["visual"],
      custom: { keep: true },
    });
    assert.equal(refreshes, 1);
  });

  it("normalizes masterpiece labels while preserving unrelated frontmatter", async () => {
    const file = mediaFile("AnimeList/Novel/example.md");
    const frontmatter: Record<string, unknown> = {
      media_type: "novel",
      favorite: false,
      source_provider: "AniList",
      custom_field: "keep",
    };
    let refreshes = 0;
    const app = {
      vault: { getAbstractFileByPath: (path: string) => path === file.path ? file : null },
      fileManager: {
        processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => update(frontmatter),
      },
    } as unknown as App;
    const service = new SpecialLabelStateService(app, { refreshViews: () => { refreshes += 1; } });

    await service.update(file.path, {
      favorite: true,
      masterpieceLabels: [" Visual ", "visual", "Sound Design"],
    });
    assert.deepEqual(frontmatter, {
      media_type: "novel",
      favorite: true,
      masterpiece_labels: ["Visual", "Sound Design"],
      source_provider: "AniList",
      custom_field: "keep",
    });

    await service.update(file.path, { favorite: false, masterpieceLabels: [] });
    assert.deepEqual(frontmatter, {
      media_type: "novel",
      favorite: false,
      source_provider: "AniList",
      custom_field: "keep",
    });
    assert.equal(refreshes, 2);
  });

  it("rejects missing notes before persistence or refresh", async () => {
    let persisted = false;
    let refreshed = false;
    const app = {
      vault: { getAbstractFileByPath: () => null },
      fileManager: {
        processFrontMatter: async () => { persisted = true; },
      },
    } as unknown as App;
    const service = new SpecialLabelStateService(app, { refreshViews: () => { refreshed = true; } });

    await assert.rejects(
      service.update("missing.md", { favorite: true, masterpieceLabels: ["visual"] }),
      /找不到作品筆記|Media note/i,
    );
    assert.equal(persisted, false);
    assert.equal(refreshed, false);
  });
});
