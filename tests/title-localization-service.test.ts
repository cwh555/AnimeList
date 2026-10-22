import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile } from "obsidian";
import type { ExternalMediaResult } from "../src/domain/media-types";
import { applyStoredTitleUpdates, planStoredTitleUpdates, type TitleScanRow } from "../src/data/title-localization-service";

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

function aniListResult(): ExternalMediaResult {
  return {
    ...bangumiResult("原題", "简体标题"),
    provider: "anilist", sourceId: "42",
    sourceUrl: "https://anilist.co/anime/42",
    title: "Original English",
    titleVariants: { fallback: "Original English", original: "原題", localized: { en: "Original English", ja: "原題" } },
    searchTitles: ["原題", "Original English"],
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

  it("incremental title scans skip checked works without network I/O", async () => {
    const note = testNote("AnimeList/Show.md", {
      media_type: "anime", source_provider: "bangumi", source_id: "88", title: "原題",
    });
    const result = await planStoredTitleUpdates(note.app, [""], "zh-TW", {
      intervalMs: 0,
      shouldScan: () => false,
      fetch: async () => { throw new Error("No network request is allowed"); },
    });
    assert.equal(result.scanned, 0);
    assert.equal(result.rows.length, 0);
    assert.equal(result.items.length, 0);
    assert.equal(note.written.length, 0);
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

  it("accepts a romanized provider alias while still requiring an exact provider ID", async () => {
    const note = testNote("romaji.md", {
      media_type: "anime", source_provider: "bangumi", source_id: "88",
      title: "Romanized Title",
    });
    const plan = await planStoredTitleUpdates(note.app, [""], "zh-CN", {
      intervalMs: 0,
      fetch: async () => ({
        ...bangumiResult("原題", "简体标题"),
        romajiTitle: "Romanized Title",
        searchTitles: ["原題", "Romanized Title", "简体标题"],
      }),
    });
    assert.equal(plan.items.length, 1);
    assert.equal(plan.items[0].newTitle, "简体标题");
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


  it("exposes a labeled unchecked OpenCC candidate when Traditional is missing", async () => {
    const note = testNote("tw.md", {
      media_type: "anime", title: "原題", source_provider: "bangumi", source_id: "88",
    });
    const progress: TitleScanRow[] = [];
    const plan = await planStoredTitleUpdates(note.app, [""], "zh-TW", {
      intervalMs: 0,
      fetch: async () => ({
        ...bangumiResult("原題", "简体标题"),
        titleVariants: { fallback: "简体标题", original: "原題", localized: { "zh-CN": "简体标题" } },
      }),
      onProgress: (_done, _total, row) => progress.push(row),
    });
    assert.equal(plan.scanned, 1);
    assert.equal(plan.items.length, 1);
    assert.equal(plan.items[0].newTitle, "簡體標題");
    assert.equal(plan.items[0].requiresReview, true);
    assert.equal(plan.rows[0].status, "review");
    assert.match(plan.rows[0].reason, /NOT an official/);
    assert.deepEqual(plan.items[0].localized, { "zh-CN": "简体标题" });
    assert.equal(progress.length, 1);
    assert.equal(progress[0].title, "原題");
    assert.equal(note.written.length, 0);
  });

  it("keeps genuinely missing translations visible as a skip", async () => {
    const note = testNote("no-titles.md", {
      media_type: "anime", title: "原題", source_provider: "bangumi", source_id: "88",
    });
    const plan = await planStoredTitleUpdates(note.app, [""], "zh-TW", {
      intervalMs: 0,
      fetch: async () => ({
        ...bangumiResult("原題", ""),
        titleVariants: { fallback: "原題", original: "原題", localized: {} },
      }),
    });
    assert.equal(plan.rows[0].status, "no-translation");
    assert.equal(plan.items.length, 0);
  });

  it("converts saved Traditional Chinese to a reviewable Simplified candidate without claiming a verified translation", async () => {
    const note = testNote("converted.md", {
      media_type: "anime", title: "傳統文字", title_localizations: { "zh-TW": "傳統文字" },
    });
    const plan = await planStoredTitleUpdates(note.app, [""], "zh-CN", { intervalMs: 0 });
    assert.equal(plan.rows[0].status, "review");
    assert.equal(plan.items[0].newTitle, "传统文字");
    assert.equal(plan.items[0].requiresReview, true);
    assert.deepEqual(plan.items[0].localized, { "zh-TW": "傳統文字" });
  });

  it("remembers accepted OpenCC names separately from official titles and supports round trips", async () => {
    const note = testNote("round-trip.md", {
      title: "原題", media_type: "anime", source_provider: "bangumi", source_id: "88",
      title_localizations: { "zh-CN": "简体标题" },
    });
    const fetched = async () => ({
      ...bangumiResult("原題", "简体标题"),
      titleVariants: { fallback: "简体标题", original: "原題", localized: { "zh-CN": "简体标题" } },
    });
    const traditional = await planStoredTitleUpdates(note.app, [""], "zh-TW", { intervalMs: 0, fetch: fetched });
    assert.equal(traditional.items[0].requiresReview, true);
    assert.equal(traditional.items[0].newTitle, "簡體標題");
    assert.equal(traditional.items[0].scriptConversions["zh-TW"], "簡體標題");
    assert.equal(traditional.items[0].localized["zh-TW"], undefined);
    assert.equal((await applyStoredTitleUpdates(note.app, traditional, new Set([note.file.path]))).updated, 1);
    assert.deepEqual(note.data.title_localizations, { "zh-CN": "简体标题" });
    assert.deepEqual(note.data.title_script_conversions, { "zh-TW": "簡體標題" });

    const simplified = await planStoredTitleUpdates(note.app, [""], "zh-CN", {
      intervalMs: 0,
      fetch: async () => { throw new Error("Verified stored title should avoid network fetch"); },
    });
    assert.equal(simplified.items.length, 1);
    assert.equal(simplified.items[0].newTitle, "简体标题");
    assert.equal((await applyStoredTitleUpdates(note.app, simplified, new Set([note.file.path]))).updated, 1);

    const back = await planStoredTitleUpdates(note.app, [""], "zh-TW", { intervalMs: 0, fetch: fetched });
    assert.equal(back.items.length, 1);
    assert.equal(back.items[0].requiresReview, true);
    assert.match(back.rows[0].reason, /Previously approved OpenCC/);
    assert.equal(back.items[0].newTitle, "簡體標題");
    assert.equal((await applyStoredTitleUpdates(note.app, back, new Set([note.file.path]))).updated, 1);
    assert.equal(note.data.title, "簡體標題");
    assert.deepEqual(note.data.title_localizations, { "zh-CN": "简体标题" });
  });

  it("resolves Bangumi ID from source URLs even when primary provider is AniList", async () => {
    const note = testNote("links.md", {
      title: "原題", media_type: "anime", source_provider: "anilist", source_id: "42",
      source_urls: ["https://anilist.co/anime/42", "https://bgm.tv/subject/88"],
    });
    const seen: string[] = [];
    const plan = await planStoredTitleUpdates(note.app, [""], "zh-CN", {
      intervalMs: 0,
      fetch: async (_type, source) => {
        seen.push(source.provider + ":" + source.id);
        return source.provider === "anilist" ? aniListResult() : bangumiResult("原題", "简体标题");
      },
    });
    assert.deepEqual(seen, ["anilist:42", "bangumi:88"]);
    assert.equal(plan.rows[0].status, "ready");
    assert.equal(plan.items[0].newTitle, "简体标题");
  });

  it("reviews cross-provider matches and never accepts an ambiguous title as identity", async () => {
    const note = testNote("anilist.md", {
      title: "原題", title_original: "原題", year: 2021,
      media_type: "anime", source_provider: "anilist", source_id: "42",
    });
    const progress: string[] = [];
    const plan = await planStoredTitleUpdates(note.app, [""], "zh-CN", {
      intervalMs: 0,
      lookup: async (_type, title) => {
        progress.push(title);
        return [bangumiResult("原題", "简体标题")];
      },
      fetch: async (_type, source) => {
        assert.ok(source.id === "42" || source.id === "88");
        return source.id === "42" ? aniListResult() : bangumiResult("原題", "简体标题");
      },
    });
    assert.deepEqual(progress, ["原題"]);
    assert.equal(plan.items.length, 1);
    assert.equal(plan.rows[0].status, "review");
    assert.equal(plan.items[0].requiresReview, true);
    const ambiguous = await planStoredTitleUpdates(note.app, [""], "zh-CN", {
      intervalMs: 0,
      lookup: async () => [bangumiResult("原題", "简体标题"), { ...bangumiResult("原題", "繁體標題"), sourceId: "99" }],
      fetch: async (_type, source) => {
        if (source.provider !== "anilist") throw Error("Must not fetch ambiguous candidates");
        return aniListResult();
      },
    });
    assert.equal(ambiguous.items.length, 0);
    assert.equal(ambiguous.rows[0].status, "ambiguous");
    assert.equal(note.written.length, 0);
  });

  it("filters cross-provider false positives by year and reports unmatched works", async () => {
    const note = testNote("wrongyear.md", {
      title: "原題", year: 2022, media_type: "anime", source_provider: "anilist", source_id: "42",
    });
    const plan = await planStoredTitleUpdates(note.app, [""], "zh-CN", {
      intervalMs: 0,
      lookup: async () => [bangumiResult("原題", "简体标题")],
      fetch: async (_type, source) => {
        if (source.provider !== "anilist") throw Error("A different release year must not be fetched");
        return aniListResult();
      },
    });
    assert.equal(plan.rows[0].status, "no-source");
    assert.equal(plan.items.length, 0);
  });

  it("uses bounded concurrency instead of waiting serially for every work", async () => {
    const inputs = Array.from({ length: 8 }, (_, i) => testNote("work-" + i + ".md", {
      title: "原題", media_type: "anime", source_provider: "bangumi", source_id: String(100 + i),
    }));
    const byPath = new Map(inputs.map(v => [v.file.path, v]));
    const app = {
      vault: { getRoot: () => ({ children: inputs.map(v => v.file) }) },
      metadataCache: { getFileCache: (f: TFile) => ({ frontmatter: byPath.get(f.path)?.data }) },
    } as any;
    let active = 0;
    let peak = 0;
    const updates: TitleScanRow[] = [];
    const started: string[] = [];
    const plan = await planStoredTitleUpdates(app, [""], "zh-CN", {
      intervalMs: 0, concurrency: 3,
      onStart: (_completed, _total, title) => started.push(title),
      fetch: async (_type, source) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 2));
        active--;
        return { ...bangumiResult("原題", "简体标题"), sourceId: source.id };
      },
      onProgress: (_completed, _total, row) => updates.push(row),
    });
    assert.equal(plan.scanned, 8);
    assert.equal(plan.items.length, 8);
    assert.equal(peak, 3);
    assert.equal(updates.length, 8);
    assert.equal(started.length, 8);
    assert.ok(started.every(title => title === "原題"));
    assert.ok(updates.every(r => r.status === "ready"));
  });

  it("keeps statuses distinct for no-source, custom title and provider failures", async () => {
    const noSource = testNote("manual.md", { title: "Manual title", media_type: "novel" });
    const manual = await planStoredTitleUpdates(noSource.app, [""], "zh-CN", { intervalMs: 0 });
    assert.equal(manual.rows[0].status, "no-source");
    const bad = testNote("error.md", {
      title: "原題", media_type: "anime", source_provider: "bangumi", source_id: "88",
    });
    const broken = await planStoredTitleUpdates(bad.app, [""], "zh-CN", {
      intervalMs: 0, fetch: async () => { throw new Error("HTTP 429"); },
    });
    assert.equal(broken.rows[0].status, "lookup-failed");
    assert.equal(broken.failures.length, 1);
    assert.match(broken.failures[0].message, /429/);
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
