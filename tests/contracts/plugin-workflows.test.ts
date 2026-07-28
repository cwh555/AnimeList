import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App } from "obsidian";
import AnimeListPlugin from "../../src/main";
import { createDefaultSettings } from "../../src/settings-model";
import type { MediaItem } from "../../src/types";
import { TimelineModal } from "../../src/ui/timeline-modal";

function timelineItem(): MediaItem {
  return {
    title: "Example",
    originalTitle: "",
    mediaType: "anime",
    format: "tv",
    status: "completed",
    releaseStatus: "finished",
    progress: 12,
    total: 12,
    unit: "episode",
    score: 8.5,
    favorite: false,
    year: 2026,
    genres: [],
    people: [],
    platforms: [],
    sourceUrls: [],
    cover: "",
    filePath: "AnimeList/Anime/example.md",
    updated: 0,
    updatedLabel: "",
    startedAt: "",
    completedAt: "2026-01-01",
    volumeLog: [],
  };
}

describe("plugin UI workflows", () => {
  it("opens timeline items in a modal without navigating the library view", async () => {
    const plugin = Object.create(AnimeListPlugin.prototype) as AnimeListPlugin;
    plugin.app = new App();
    plugin.settings = createDefaultSettings();
    const items = [timelineItem()];
    let initialized = 0;
    let collected = 0;
    let opened: TimelineModal | null = null;
    plugin.initializeLibrary = async () => { initialized += 1; };
    plugin.collectMediaItems = () => { collected += 1; return items; };

    const originalOpen = TimelineModal.prototype.open;
    TimelineModal.prototype.open = function open(): void {
      opened = this;
    };
    try {
      await plugin.openTimeline();
    } finally {
      TimelineModal.prototype.open = originalOpen;
    }

    assert.equal(initialized, 1);
    assert.equal(collected, 1);
    assert.ok(opened instanceof TimelineModal);
    assert.equal(
      (opened as unknown as { items: MediaItem[] }).items,
      items,
    );
  });
});
