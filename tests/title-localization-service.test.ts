import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile } from "obsidian";
import type { ExternalMediaResult } from "../src/domain/media-types";
import { applyStoredTitleUpdates, planStoredTitleUpdates } from "../src/data/title-localization-service";

function testNote(path: string, frontmatter: Record<string, unknown>) {
  const file = new TFile();
  file.path = path;
  file.basename = path.split("/").pop()?.replace(/\.md$/, "") ?? "";
  file.extension = "md";
  file.stat.mtime = 100;
  const data = structuredClone(frontmatter);
  const written: Record<string, unknown>[] = [];
  const app = {
    metadataCache: { getFileCache: () => ({ frontmatter: data }) },
    vault: {
      getRoot: () => ({ children: [file] }),
      getAbstractFileByPath: (p: string) => p === file.path ? file : null,
    },
    fileManager: {
      async processFrontMatter(_file: TFile, callback: (value: Record<string, unknown>) => void) {
        callback(data);
        written.push(structuredClone(data));
      },
    },
  } as any;
  return { file, data, app, written };
}

function bangumiResult(title: string, titleCN: string): ExternalMediaResult {
  return {
    provider: "bangumi", sourceId: "88", sourceUrl: "https://bgm.tv/subject/88",
    mediaType: "anime", title: titleCN, originalTitle: "原題", romajiTitle: "",
    year: 2021, format: "tv", total: 12, unit: "episode", genres: [], rawGenres: [],
    people: ["Company"], platforms: [], coverUrl: "", summary: "", externalScore: null, releaseStatus: "unknown",
    searchTitles: ["原題", title, titleCN],
    titleVariants: { fallback: titleCN, original: "原題", localized: { "zh-CN": titleCN, "zh-TW": "繁體標題" } },
  };
}

describe("safe existing-title localization", () => {
  it("plans without writing; applies only selected titles preserving metadata, aliases and content", async () => {
    const note = testNote("AnimeList/Show.md", {
      media_type: "anime", source_provider: "bangumi", source_id: "88",
      title: "原題", genres: ["Love"], tags: ["mine"], cover: "![[a.png]]",
      custom: { nested: true }, title_aliases: ["old alias"],
    });
    let calls = 0;
    const plan = await planStoredTitleUpdates(note.app, [""], "zh-CN", {
      intervalMs: 0, fetch: async () => { calls += 1; return bangumiResult("原題", "简体标题"); },
    });
    assert.equal(calls, 1);
    assert.equal(plan.items.length, 1);
    assert.equal(plan.items[0].oldTitle, "原題");
    assert.equal(plan.items[0].newTitle, "简体标题");
    assert.equal(note.written.length, 0);
    assert.equal(note.data.title, "原題");
    const noSelection = await applyStoredTitleUpdates(note.app, plan, new Set());
    assert.equal(noSelection.updated, 0);
    const result = await applyStoredTitleUpdates(note.app, plan, new Set([note.file.path]));
    assert.equal(result.updated, 1);
    assert.equal(note.data.title, "简体标题");
    assert.equal(note.data.title_original, "原題");
    assert.deepEqual(note.data.title_localizations, { "zh-TW": "繁體標題", "zh-CN": "简体标题" });
    assert.ok((note.data.title_aliases as string[]).includes("原題"));
    assert.ok((note.data.title_aliases as string[]).includes("old alias"));
    assert.deepEqual(note.data.tags, ["mine"]);
    assert.deepEqual(note.data.custom, { nested: true });
    assert.equal(note.file.path, "AnimeList/Show.md");
  });

  it("reuses verified stored variants across languages without a network call", async () => {
    const note = testNote("anime.md", {
      media_type: "anime", source_provider: "bangumi", source_id: "88",
      title: "简体标题", title_original: "原題",
      title_localizations: { "zh-TW": "繁體標題", "zh-CN": "简体标题" },
    });
    const plan = await planStoredTitleUpdates(note.app, [""], "zh-TW", {
      fetch: async () => { throw new Error("Should not refetch stored translations"); },
    });
    assert.equal(plan.items.length, 1);
    await applyStoredTitleUpdates(note.app, plan, new Set([note.file.path]));
    assert.equal(note.data.title, "繁體標題");
    assert.deepEqual(note.data.title_localizations, { "zh-TW": "繁體標題", "zh-CN": "简体标题" });
  });

  it("does not overwrite manually authored names or guess missing titles", async () => {
    const note = testNote("custom.md", {
      media_type: "anime", source_provider: "bangumi", source_id: "88",
      title: "我自己起的名字", custom: "keep",
    });
    const plan = await planStoredTitleUpdates(note.app, [""], "zh-CN", {
      intervalMs: 0, fetch: async () => bangumiResult("原題", "简体标题"),
    });
    assert.equal(plan.items.length, 0);
    assert.equal(plan.skipped, 1);
    assert.equal(note.written.length, 0);
    const korean = await planStoredTitleUpdates(note.app, [""], "ko", {
      intervalMs: 0, fetch: async () => bangumiResult("原題", "简体标题"),
    });
    assert.equal(korean.items.length, 0);
  });

  it("rejects mismatched API identities and reports provider failures", async () => {
    const note = testNote("x.md", {
      media_type: "anime", source_provider: "bangumi", source_id: "88", title: "原題",
    });
    const plan = await planStoredTitleUpdates(note.app, [""], "zh-CN", {
      intervalMs: 0, fetch: async () => ({ ...bangumiResult("原題", "简体标题"), sourceId: "99" }),
    });
    assert.equal(plan.items.length, 0);
    assert.equal(plan.failures.length, 1);
    assert.match(plan.failures[0].message, /unexpected media identity/);
    assert.equal(note.written.length, 0);
  });

  it("skips stale preview rows when the title, identity or file version changes", async () => {
    const note = testNote("a.md", {
      media_type: "anime", source_provider: "bangumi", source_id: "88", title: "原題",
    });
    const plan = await planStoredTitleUpdates(note.app, [""], "zh-CN", {
      intervalMs: 0, fetch: async () => bangumiResult("原題", "简体标题"),
    });
    note.data.title = "User edit";
    const stale = await applyStoredTitleUpdates(note.app, plan, new Set(["a.md"]));
    assert.equal(stale.updated, 0);
    assert.equal(stale.skipped, 1);
    assert.equal(note.data.title, "User edit");
    assert.equal(note.data.title_localizations, undefined);
    note.data.title = "原題";
    note.file.stat.mtime += 1;
    const changed = await applyStoredTitleUpdates(note.app, plan, new Set(["a.md"]));
    assert.equal(changed.updated, 0);
    assert.equal(changed.skipped, 1);
  });

  it("aborts preview before scanning additional notes", async () => {
    const note = testNote("a.md", {
      media_type: "anime", source_provider: "bangumi", source_id: "88", title: "原題",
    });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      planStoredTitleUpdates(note.app, [""], "zh-CN", { signal: controller.signal }),
      /cancelled/,
    );
    assert.equal(note.written.length, 0);
  });
});
