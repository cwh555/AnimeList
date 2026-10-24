import assert from "node:assert/strict";
import { TFile } from "obsidian";
import type { AnimeListFeatureHost } from "../src/app/feature-types";
import { presentationCoverCandidates, readPresentationCover, resolvePresentationCoverSources } from "../src/data/presentation-cover-service";
import { describe, it } from "node:test";
import { emptyRankingState } from "../src/domain/pairwise-ranking";
import type { MediaItem } from "../src/domain/media-types";
import {
  buildPresentationDocument, formatPresentationText,
  rankingLabelsForLibrary,
} from "../src/domain/presentation-export";
import { planPresentationPages, PRESENTATION_IMAGE_MAX_PIXELS } from "../src/domain/presentation-export-layout";

function item(title: string, score: number | null, status: "completed" | "ongoing" = "completed"): MediaItem {
  return {
    filePath: `AnimeList/Anime/${title}.md`, title, originalTitle: title,
    mediaType: "anime", format: "anime", status, releaseStatus: "finished",
    progress: 0, total: 0, unit: "episode", score, favorite: false,
    year: "", genres: [], mediaTags: [], userTags: [], people: [],
    platforms: [], sourceUrls: [], cover: "", updated: 0, updatedLabel: "",
  } as MediaItem;
}

describe("presentation export", () => {
  it("uses exactly the score dashboard lanes, including zero and optional unrated", () => {
    const items = [item("Top", 10), item("Zero", 0), item("Missing", null)];
    const output = buildPresentationDocument(items, { kind: "scoreboard", mediaType: "anime" });
    assert.deepEqual(output.sections.map(x => x.label), ["10.0", "0.0"]);
    assert.equal(output.total, 3);
    assert.equal(output.pending, 1);
    assert.doesNotMatch(formatPresentationText(output), /Missing/);
    const withUnrated = buildPresentationDocument(items, { kind: "scoreboard", mediaType: "anime", includeUnrated: true });
    assert.equal(withUnrated.sections.at(-1)?.entries[0].item.title, "Missing");
  });
  it("preserves certified absolute ranks and uncertain intervals", () => {
    const items = [item("A", 10), item("B", 9), item("C", 8), item("D", 7)];
    const state = emptyRankingState();
    state.anime.ordered = [items[0].filePath, items[1].filePath, items[2].filePath];
    // Only relationships on ordered entries are established. D is unresolved.
    const labels = rankingLabelsForLibrary(items, state);
    assert.equal(labels.get(items[3].filePath), "#1~4/4");
    assert.equal(labels.get(items[0].filePath), "#1~2/4");
    const ranked = buildPresentationDocument(items, {kind: "ranking", mediaType: "anime", ranking: state});
    assert.equal(ranked.total, 4);
    assert.equal(ranked.pending, 4);
    assert.equal(ranked.sections.at(-1)?.entries.length, 4);
    assert.equal(rankingLabelsForLibrary([...items, item("Ongoing", 5, "ongoing")], state).has("AnimeList/Anime/Ongoing.md"), false);
  });
  it("splits large galleries before canvas limits and includes each work once", () => {
    const items = Array.from({length: 500}, (_, i) => item(`Item-${i}`, 9));
    const doc = buildPresentationDocument(items, {kind: "scoreboard", mediaType: "anime"});
    const plan = planPresentationPages(doc);
    assert.ok(plan.pages.length > 1);
    assert.equal(plan.pages.flatMap(page => page.sections.flatMap(section => section.cards)).length, 500);
    for (const page of plan.pages) {
      assert.ok(page.width * page.height * plan.pixelRatio ** 2 <= PRESENTATION_IMAGE_MAX_PIXELS);
      assert.ok(page.height * plan.pixelRatio < 4096);
      for (const section of page.sections) for (const card of section.cards) {
        assert.ok(card.y + card.height <= page.height);
      }
    }
  });
});

describe("presentation cover resolution", () => {
  it("recovers the original local cover when MediaItem has a display URL", async () => {
    const note = new TFile();
    note.path = "AnimeList/Anime/Work.md";
    const cover = new TFile();
    cover.path = "AnimeList/Covers/Work.webp";
    const itemValue = item("Work", 10);
    itemValue.cover = "app://obsidian.md/vault/AnimeList/Covers/Work.webp";
    const binary = new Uint8Array([82, 73, 70, 70]).buffer;
    const host = {
      app: {
        metadataCache: {
          getFileCache(file: TFile) {
            return file === note ? { frontmatter: { cover: "[[Covers/Work.webp]]" } } : null;
          },
          getFirstLinkpathDest(reference: string, source: string) {
            return reference === "Covers/Work.webp" && source === note.path ? cover : null;
          },
        },
        vault: {
          getAbstractFileByPath(path: string) {
            return path === note.path ? note : path === cover.path ? cover : null;
          },
          async readBinary(file: TFile) {
            assert.equal(file, cover);
            return binary;
          },
        },
      },
    } as unknown as AnimeListFeatureHost;
    assert.deepEqual(presentationCoverCandidates(
      "[[Covers/Work.webp]]", "https://example.com/fallback.jpg", itemValue.cover,
    ), ["Covers/Work.webp", "https://example.com/fallback.jpg"]);
    assert.deepEqual(resolvePresentationCoverSources(host, itemValue), [
      { kind: "file", path: cover.path },
    ]);
    const loaded = await readPresentationCover(host, itemValue);
    assert.equal(loaded?.contentType, "image/webp");
    assert.deepEqual(new Uint8Array(loaded?.data), new Uint8Array(binary));
  });
});
