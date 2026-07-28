import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App, TFile } from "obsidian";
import { MediaUpdateService } from "../../src/data/media-update-service";
import type { MediaNoteForm } from "../../src/domain/media-types";

function animeForm(): MediaNoteForm {
  return {
    title: "Updated title",
    status: "ongoing",
    releaseStatus: "unknown",
    progress: 5,
    total: 12,
    unit: "episode",
    score: 8.5,
    favorite: true,
    startedAt: "2026-01-01",
    completedAt: "",
    genres: ["戀愛"],
    templatePath: "",
    volumeLog: [],
  };
}

describe("media update service", () => {
  it("updates editable fields while preserving unknown frontmatter and note body", async () => {
    const file = new TFile();
    file.path = "AnimeList/Anime/example.md";
    const frontmatter: Record<string, unknown> = {
      schema_version: 5,
      media_type: "anime",
      title: "Old title",
      source_provider: "AniList",
      source_id: "42",
      custom_nested: { keep: [1, 2, 3] },
      updated_at: "legacy",
      metadata_updated_at: "legacy",
    };
    const body = "# Old title\n\nCustom body must remain unchanged.";
    let bodyAfter = body;
    let processCalls = 0;
    let modifyCalls = 0;
    let refreshes = 0;
    const app = {
      fileManager: {
        processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => {
          processCalls += 1;
          update(frontmatter);
        },
      },
      vault: {
        modify: async () => {
          modifyCalls += 1;
          bodyAfter = "modified";
        },
      },
    } as unknown as App;

    await new MediaUpdateService(app, { refreshViews: () => { refreshes += 1; } })
      .update(file, "anime", animeForm());

    assert.equal(processCalls, 1);
    assert.equal(modifyCalls, 0);
    assert.equal(refreshes, 1);
    assert.equal(bodyAfter, body);
    assert.deepEqual(frontmatter.custom_nested, { keep: [1, 2, 3] });
    assert.equal(frontmatter.source_provider, "AniList");
    assert.equal(frontmatter.source_id, "42");
    assert.equal(frontmatter.schema_version, 6);
    assert.equal(frontmatter.title, "Updated title");
    assert.equal(frontmatter.progress, 5);
    assert.equal(frontmatter.progress_total, 12);
    assert.equal(frontmatter.score, 8.5);
    assert.equal(frontmatter.favorite, true);
    assert.equal(frontmatter.updated_at, undefined);
    assert.equal(frontmatter.metadata_updated_at, undefined);
  });

  it("does not refresh after validation rejects an invalid edit", async () => {
    const file = new TFile();
    file.path = "AnimeList/Anime/example.md";
    const frontmatter: Record<string, unknown> = { media_type: "anime", custom: "keep" };
    let refreshes = 0;
    const app = {
      fileManager: {
        processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => update(frontmatter),
      },
    } as unknown as App;
    const form = animeForm();
    form.title = "";

    await assert.rejects(
      new MediaUpdateService(app, { refreshViews: () => { refreshes += 1; } })
        .update(file, "anime", form),
      /請輸入作品名稱/,
    );
    assert.equal(refreshes, 0);
    assert.deepEqual(frontmatter, { media_type: "anime", custom: "keep" });
  });
});
