import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { legacyTest } from "../../src/legacy";
import { normalizeVolumeLog } from "../../src/novel-progress";

const { buildMediaMarkdown } = legacyTest;

const baseResult = {
  provider: "anilist",
  sourceId: "1",
  sourceUrl: "https://anilist.co/anime/1",
  mediaType: "anime",
  title: "Example",
  originalTitle: "原題",
  romajiTitle: "Example",
  format: "tv",
  year: 2026,
  coverUrl: "https://example.com/cover.jpg",
  genres: ["Romance"],
  rawGenres: ["Romance"],
  people: ["Studio"],
  platforms: [],
  total: 12,
  unit: "episode",
  summary: "Summary",
  externalScore: null,
  releaseStatus: "finished",
} as const;

function frontmatter(markdown: string): string {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "generated note must start with YAML frontmatter");
  return match[1];
}

describe("media note Markdown compatibility", () => {
  it("keeps completed anime progress, dates, score, and local cover fields stable", () => {
    const markdown = buildMediaMarkdown(baseResult, {
      title: "Example",
      score: 8.5,
      status: "completed",
      releaseStatus: "unknown",
      startedAt: "2026-01-01",
      completedAt: "2026-01-02",
      progress: 3,
      total: 12,
      unit: "episode",
      favorite: true,
      genres: ["Romance"],
      templatePath: "",
      volumeLog: [],
    }, "AnimeList/Covers/anime/example.webp", "");

    const yaml = frontmatter(markdown);
    assert.match(yaml, /^schema_version: 6$/m);
    assert.match(yaml, /^status: "completed"$/m);
    assert.match(yaml, /^progress: 12$/m);
    assert.match(yaml, /^progress_total: 12$/m);
    assert.match(yaml, /^score: 8\.5$/m);
    assert.match(yaml, /^started_at: "2026-01-01"$/m);
    assert.match(yaml, /^completed_at: "2026-01-02"$/m);
    assert.match(yaml, /^cover: "AnimeList\/Covers\/anime\/example\.webp"$/m);
    assert.doesNotMatch(yaml, /^updated_at:/m);
    assert.match(markdown, /!\[\[AnimeList\/Covers\/anime\/example\.webp\|260]]/);
  });

  it("keeps serial-entry metadata and unrelated fields when writing a novel note", () => {
    const markdown = buildMediaMarkdown({
      ...baseResult,
      mediaType: "novel",
      format: "light_novel",
      unit: "volume",
      total: 0,
      releaseStatus: "releasing",
    }, {
      title: "Example novel",
      score: 9,
      status: "ongoing",
      releaseStatus: "releasing",
      startedAt: "",
      completedAt: "",
      progress: "1.5",
      total: 0,
      unit: "volume",
      favorite: false,
      genres: [],
      templatePath: "",
      volumeLog: normalizeVolumeLog([{
        label: "1",
        completed_at: "2026-01-02",
        cover: "volume-1.jpg",
        cover_provider: "Bangumi",
        cover_source_id: "book-1",
        isbn: "9780000000000",
      }]),
    }, "", "");

    const yaml = frontmatter(markdown);
    assert.match(yaml, /^release_status: "releasing"$/m);
    assert.match(yaml, /^progress: 1\.5$/m);
    assert.doesNotMatch(yaml, /^progress_total:/m);
    assert.match(yaml, /volume_log:[\s\S]*isbn: "9780000000000"/);
    assert.match(yaml, /volume_log:[\s\S]*cover: "volume-1\.jpg"/);
    assert.match(yaml, /volume_log:[\s\S]*cover_provider: "Bangumi"/);
    assert.match(yaml, /volume_log:[\s\S]*cover_source_id: "book-1"/);
  });

  it("removes template frontmatter but preserves custom body content and unknown variables", () => {
    const template = [
      "---",
      "custom_template_key: keep-out-of-media-frontmatter",
      "---",
      "# {{title}}",
      "",
      "Custom paragraph.",
      "",
      "Unknown token: {{custom_future_token}}",
    ].join("\n");
    const markdown = buildMediaMarkdown(baseResult, {
      title: "Template title",
      score: null,
      status: "planned",
      releaseStatus: "unknown",
      startedAt: "",
      completedAt: "",
      progress: 0,
      total: 12,
      unit: "episode",
      favorite: false,
      genres: [],
      templatePath: "custom.md",
      volumeLog: [],
    }, "", template);

    assert.doesNotMatch(frontmatter(markdown), /custom_template_key/);
    assert.match(markdown, /# Template title\n\n```animelist-detail\n```[\s\S]*Custom paragraph\./);
    assert.match(markdown, /Unknown token: \{\{custom_future_token}}/);
  });
});
