import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { App, TFile, TFolder } from "obsidian";
import AnimeListPlugin from "../src/main";
import { BUILTIN_TEMPLATES, getBuiltInTemplateOptions } from "../src/builtin-templates";
import { AnimeListSettingTab, DEFAULT_SETTINGS } from "../src/settings";
import { legacyTest } from "../src/legacy";
import { getScopedMarkdownFiles } from "../src/vault-scope";

const {
  buildMediaMarkdown,
  completedProgress,
  normalizeGenres,
  sanitizePathPart,
} = legacyTest;

describe("media normalization", () => {
  it("normalizes common genre names to Traditional Chinese", () => {
    assert.deepEqual(
      normalizeGenres(["Romance", "恋爱", "Comedy", "Slice of Life"]),
      ["戀愛", "喜劇", "日常"],
    );
  });

  it("sanitizes file names", () => {
    assert.equal(sanitizePathPart('A/B: C? "D"'), "A B C D");
  });
});

describe("media note generation", () => {
  const result = {
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
  };

  it("forces completed progress to the total", () => {
    assert.equal(completedProgress("completed", 12, 3), 12);
    assert.equal(completedProgress("watching", 12, 3), 3);
  });

  it("creates Markdown without a custom updated timestamp", () => {
    const markdown = buildMediaMarkdown(result, {
      title: "Example",
      score: 8.5,
      status: "completed",
      startedAt: "2026-01-01",
      completedAt: "2026-01-02",
      progress: 3,
      total: 12,
      unit: "episode",
      favorite: true,
      genres: ["Romance"],
    }, "AnimeList/Covers/anime/example.webp", BUILTIN_TEMPLATES["builtin:anime-review"]);

    assert.ok(markdown.includes('title: "Example"'));
    assert.ok(markdown.includes("progress: 12"));
    assert.ok(markdown.includes('completed_at: "2026-01-02"'));
    assert.ok(!markdown.includes("updated_at:"));
    const body = markdown.split("---").slice(2).join("---").trim();
    assert.match(
      body,
      /^# Example\n\n```animelist-detail\n```\n\n!\[\[AnimeList\/Covers\/anime\/example\.webp\|260]]\n\n> Added on \d{4}-\d{2}-\d{2} at \d{2}:\d{2}\.$/,
    );
    assert.ok(!body.includes("## 作品簡介"));
    assert.ok(!body.includes("## 資料來源"));
  });
});

describe("repository defaults", () => {
  it("uses a managed AnimeList folder by default", () => {
    assert.equal(DEFAULT_SETTINGS.storageMode, "managed");
    assert.equal(DEFAULT_SETTINGS.libraryRoot, "AnimeList");
    assert.equal(DEFAULT_SETTINGS.uiState.sort, "completed-desc");
  });

  it("offers built-in and custom-compatible templates", () => {
    const animeTemplates = getBuiltInTemplateOptions("anime");
    assert.deepEqual(animeTemplates, [
      { path: "builtin:plain", name: "簡潔筆記（內建）" },
    ]);
  });

  it("supports managed and flat media paths", () => {
    const plugin = Object.create(AnimeListPlugin.prototype) as AnimeListPlugin;
    plugin.settings = structuredClone(DEFAULT_SETTINGS);
    assert.equal(plugin.getMediaFolder("anime"), "AnimeList/Anime");
    plugin.settings.storageMode = "flat";
    plugin.settings.flatMediaFolder = "Library";
    assert.equal(plugin.getMediaFolder("manga"), "Library");
  });

  it("exposes declarative settings while preserving storage-mode visibility", () => {
    const host = {
      settings: structuredClone(DEFAULT_SETTINGS),
      async saveSettings(): Promise<void> {},
      async initializeLibrary(): Promise<void> {},
      refreshViews(): void {},
    };
    const tab = new AnimeListSettingTab(new App(), host);
    const definitions = tab.getSettingDefinitions();
    assert.equal(definitions.length, 11);
    assert.deepEqual(
      definitions.map((definition) => definition.name),
      [
        "Storage layout",
        "Library root",
        "Flat media folder",
        "Additional scan folders",
        "Cover folder",
        "Template folder",
        "Bangumi",
        "AniList",
        "Open Library",
        "Create configured folders",
        "Copy default templates",
      ],
    );

    const libraryRoot = definitions.find((definition) => definition.name === "Library root");
    const flatFolder = definitions.find((definition) => definition.name === "Flat media folder");
    assert.equal(libraryRoot?.visible?.(), true);
    assert.equal(flatFolder?.visible?.(), false);

    host.settings.storageMode = "flat";
    assert.equal(libraryRoot?.visible?.(), false);
    assert.equal(flatFolder?.visible?.(), true);
  });
});


describe("timeline modal and Traditional Chinese labels", () => {
  it("opens the timeline through an Obsidian modal instead of replacing the library view", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    assert.match(mainSource, /new TimelineModal\(this, this\.collectMediaItems\(\)\)\.open\(\)/);
    assert.doesNotMatch(mainSource, /showSection\("timeline"\)/);
  });

  it("uses the requested status and timeline labels", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    assert.match(legacySource, /active: "追番中"/);
    assert.match(legacySource, /planned: "待追"/);
    assert.match(legacySource, /appendIconLabel\(timelineButton, "timeline", "時間軸"\)/);
    assert.doesNotMatch(legacySource, /完成時間軸|願望清單|active: "追番"/);
  });
});


describe("Obsidian community review compliance", () => {
  it("does not assign HTML strings directly", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    assert.doesNotMatch(legacySource, /\.innerHTML\s*=/);
    assert.match(legacySource, /setIcon\(/);
  });

  it("preserves custom view placement during plugin unload", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    assert.doesNotMatch(mainSource, /detachLeavesOfType/);
  });

  it("uses native setting headings", () => {
    const settingsSource = readFileSync(path.join(process.cwd(), "src/settings.ts"), "utf8");
    assert.doesNotMatch(settingsSource, /createEl\("h[23]"/);
    assert.equal((settingsSource.match(/\.setHeading\(\)/g) || []).length, 2);
  });

  it("attests release assets", () => {
    const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/release.yml"), "utf8");
    assert.match(workflow, /actions\/attest@v4/);
    assert.match(workflow, /attestations: write/);
    assert.match(workflow, /artifact-metadata: write/);
    assert.match(workflow, /subject-path:[\s\S]*main\.js[\s\S]*manifest\.json[\s\S]*styles\.css/);
  });
});


describe("Community review preflight", () => {
  it("contains no blocking DOM, lifecycle, or settings-heading patterns", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    const settingsSource = readFileSync(path.join(process.cwd(), "src/settings.ts"), "utf8");
    assert.doesNotMatch(legacySource, /\.innerHTML\s*=/);
    assert.doesNotMatch(mainSource, /detachLeavesOfType\s*\(/);
    assert.doesNotMatch(settingsSource, /setName\(["']AnimeList["']\)\.setHeading\(\)/);
  });

  it("uses paired, allowed compatibility lint scopes without forbidden suppressions", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const mainSource = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
    const settingsSource = readFileSync(path.join(process.cwd(), "src/settings.ts"), "utf8");
    const shimSource = readFileSync(path.join(process.cwd(), "types/obsidian.d.ts"), "utf8");
    const cssSource = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
    assert.match(legacySource, /eslint-disable[^\n]*@typescript-eslint\/no-unsafe-return/);
    assert.match(legacySource, /eslint-enable[^\n]*@typescript-eslint\/no-unsafe-return/);
    assert.match(mainSource, /eslint-disable[^\n]*@typescript-eslint\/no-unsafe-member-access/);
    assert.match(mainSource, /eslint-enable[^\n]*@typescript-eslint\/no-unsafe-member-access/);
    assert.doesNotMatch(legacySource, /eslint-disable[^\n]*obsidianmd\/prefer-create-el/);
    assert.doesNotMatch(mainSource, /eslint-disable[^\n]*@typescript-eslint\/no-explicit-any/);
    assert.doesNotMatch(settingsSource, /eslint-disable/);
    assert.doesNotMatch(shimSource, /eslint-disable|\bany\b/);
    assert.doesNotMatch(cssSource, /!important|stylelint-disable/);
  });

  it("uses Obsidian DOM helpers and declarative settings definitions", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const settingsSource = readFileSync(path.join(process.cwd(), "src/settings.ts"), "utf8");
    assert.doesNotMatch(legacySource, /document\.create(?:Element|DocumentFragment|TextNode)/);
    assert.match(legacySource, /const node = createEl\(tag\)/);
    assert.match(settingsSource, /getSettingDefinitions\(\): SettingDefinition\[\]/);
  });
});


describe("scoped vault access", () => {
  it("walks only configured folders and returns Markdown files once", () => {
    const library = new TFolder();
    library.path = "AnimeList";
    const animeFolder = new TFolder();
    animeFolder.path = "AnimeList/Anime";
    const note = new TFile();
    note.path = "AnimeList/Anime/Example.md";
    note.extension = "md";
    const ignored = new TFile();
    ignored.path = "AnimeList/Anime/cover.jpg";
    ignored.extension = "jpg";
    animeFolder.children = [note, ignored];
    library.children = [animeFolder];

    const root = new TFolder();
    root.path = "";
    const rootNote = new TFile();
    rootNote.path = "Root note.md";
    rootNote.extension = "md";
    root.children = [rootNote, library];

    const app = {
      vault: {
        getRoot() { return root; },
        getAbstractFileByPath(path: string) {
          return path === "AnimeList" ? library : null;
        },
      },
    } as never;

    assert.deepEqual(
      getScopedMarkdownFiles(app, ["AnimeList", "AnimeList"]).map((file) => file.path),
      ["AnimeList/Anime/Example.md"],
    );
    assert.deepEqual(
      getScopedMarkdownFiles(app, [""]).map((file) => file.path),
      ["Root note.md"],
    );
  });
});
