import assert from "node:assert/strict";
import { it } from "node:test";
import { TFile, type App } from "obsidian";
import { CharacterLibraryService } from "../src/data/character-library-service";
import { setCharacterGalleryCover } from "../src/data/characters/gallery-cover";
import { ImageSectionService } from "../src/data/image-section-service";
import { CharacterRankingStore } from "../src/data/characters/ranking-store";
import { CharacterRankingAdapter } from "../src/data/characters/ranking-adapter";
import { characterRankingItems } from "../src/domain/characters/ranking-items";
import type { CharacterRecord } from "../src/domain/characters/character";
import { emptyRankingCollection, nextRankingPair, prepareRankingRounds, decideRanking,
  rankingPositionProjection } from "../src/domain/pairwise-ranking";
import { externalImageUri, localPathFromImageUri } from "../src/domain/characters/external-image";
import { bangumiSubjectId } from "../src/domain/characters/work-source";

function file(path: string): TFile {
  const value = new TFile();
  value.path = path; value.name = path.split("/").pop() ?? "";
  value.basename = value.name.replace(/\.md$/, "");
  value.extension = path.endsWith(".md") ? "md" : "png";
  value.stat = { ctime: 1, mtime: 1, size: 0 };
  return value;
}
function harness() {
  const files = new Map<string, TFile>();
  const markdown = new Map<string, string>();
  const metadata = new Map<string, Record<string, unknown>>();
  const folders = new Set(["AnimeList"]);
  const value = (src: string, key: string): string => {
    const line = src.split("\n").find(row => row.startsWith(key + ": "));
    return line ? JSON.parse(line.slice(key.length + 2)) as string : "";
  };
  const app = {
    vault: {
      adapter: { async exists(path: string) { return folders.has(path) || files.has(path); } },
      getAbstractFileByPath(path: string) {
        if (folders.has(path)) return { children: [...files.values()].filter(f => f.path.startsWith(path + "/")) };
        return files.get(path) ?? null;
      },
      async createFolder(path: string) { folders.add(path); },
      async create(path: string, text: string) {
        const f = file(path);
        files.set(path, f); markdown.set(path, text);
        metadata.set(path, {
          animelist_character: true, character_id: value(text, "character_id"),
          character_name: value(text, "character_name"), character_tier: "liked",
          bangumi_character_id: value(text, "bangumi_character_id"),
          character_portrait: value(text, "character_portrait"),
          character_appearances: [...text.matchAll(/^  - "([^"]+)"$/gm)].map(m => m[1]),
          user_defined: "keep",
        });
        return f;
      },
      async cachedRead(target: TFile) { return markdown.get(target.path) ?? ""; },
      async process(target: TFile, modify: (old: string) => string) {
        const next = modify(markdown.get(target.path) ?? "");
        markdown.set(target.path, next); return next;
      },
    },
    metadataCache: {
      getFileCache(target: TFile) { return { frontmatter: metadata.get(target.path) }; },
      getFirstLinkpathDest(path: string) { return files.get(path) ?? null; },
    },
    fileManager: {
      async trashFile(target: TFile) {
        files.delete(target.path);
        markdown.delete(target.path);
        metadata.delete(target.path);
      },
      async processFrontMatter(target: TFile, modify: (fm: Record<string, unknown>) => void) {
        const data = metadata.get(target.path);
        if (!data) throw new Error("no metadata");
        modify(data);
      },
    },
  } as unknown as App;
  return { app, files, markdown, metadata };
}

it("collects only chosen characters, deduplicates trusted IDs across seasons, keeps unrelated YAML", async () => {
  const h = harness(), library = new CharacterLibraryService(h.app, () => "AnimeList");
  const first = await library.collect({ name: "Example", bangumiId: "8", appearance: "Anime/S1.md" });
  const second = await library.collect({ name: "Different display name", bangumiId: "8", appearance: "Anime/S2.md" });
  assert.equal(first.path, second.path);
  assert.deepEqual(second.appearances, ["Anime/S1.md", "Anime/S2.md"]);
  assert.ok(h.markdown.get(first.path)?.includes("[[Anime/S2.md]]"), "visible work link is updated in the same note");
  await library.collect({ name: "Example", bangumiId: "9" });
  await library.collect({ name: "Example" });
  assert.equal((await library.list()).length, 3);
  await library.setTier(first.path, "top");
  await library.setPortrait(first.path, "https://example.com/a.jpg");
  assert.equal((await library.list()).find(c => c.id === first.id)?.tier, "top");
  assert.equal(h.metadata.get(first.path)?.user_defined, "keep");
});
it("links existing images idempotently, without copying or rewriting note prose", async () => {
  const h = harness(), library = new CharacterLibraryService(h.app, () => "AnimeList");
  const record = await library.collect({ name: "Picture girl" });
  const source = file("Assets/one.png");
  h.files.set(source.path, source);
  assert.equal(await library.attachImage(record.path, source.path), true);
  assert.equal(await library.attachImage(record.path, source.path), false);
  assert.equal(h.files.size, 2);
  assert.equal((h.markdown.get(record.path)?.match(/Assets\/one.png/g) ?? []).length, 1);
  assert.ok(h.markdown.get(record.path)?.includes("# Picture girl"));
});
it("uses strict existing pairwise ranking domain for character decisions", () => {
  const record = (id: string): CharacterRecord => ({
    id, path: "Chars/" + id + ".md", name: id,
    tier: "liked", bangumiId: "", portrait: "", appearances: [],
  });
  const items = characterRankingItems([record("A"), record("B")]);
  const ranking = emptyRankingCollection();
  assert.equal(prepareRankingRounds(ranking, items, "full"), true);
  const pair = nextRankingPair(ranking);
  assert.ok(pair);
  assert.equal(decideRanking(ranking, items, "better", pair), true);
  assert.deepEqual(rankingPositionProjection(ranking, items).confirmed.map(p => p.position), [1, 2]);
});
it("only accepts explicit local image paths and maintains their identity", () => {
  assert.throws(() => externalImageUri("../file.png"), /absolute/);
  assert.throws(() => externalImageUri("/tmp/notes.txt"), /format/);
  const uri = externalImageUri("/tmp/test picture.png");
  assert.equal(uri, "file:///tmp/test%20picture.png");
  assert.equal(localPathFromImageUri(uri), "/tmp/test picture.png");
});
it("stores ranking separately and protects concurrent edits", async () => {
  const data = new Map<string, string>();
  const app = { vault: { configDir: ".obsidian", adapter: {
    async exists(path: string) { return path === ".obsidian" || data.has(path); },
    async readBinary(path: string) { return new TextEncoder().encode(data.get(path) ?? "").buffer; },
    async writeBinary(path: string, value: ArrayBuffer) { data.set(path, new TextDecoder().decode(value)); },
    async process(path: string, change: (text: string) => string) {
      const value = change(data.get(path) ?? ""); data.set(path, value); return value;
    },
  } } } as unknown as App;
  const store = new CharacterRankingStore(app);
  await store.mutate(ranking => { ranking.ordered = ["Char/A.md"]; });
  assert.deepEqual((await new CharacterRankingStore(app).load()).ordered, ["Char/A.md"]);
  await store.remove("Char/A.md");
  assert.deepEqual((await new CharacterRankingStore(app).load()).ordered, []);
  data.set(".obsidian/animelist-character-ranking.json", "external-change");
  await assert.rejects(store.mutate(ranking => { ranking.ordered.push("Char/B.md"); }), /changed on another device/);
});

it("recognizes verified Bangumi work URLs but never guesses provider identities from titles", () => {
  assert.equal(bangumiSubjectId({ source_provider: "bangumi", source_id: "123" }), "123");
  assert.equal(bangumiSubjectId({ source_provider: "anilist", source_urls: ["https://bgm.tv/subject/456"] }), "456");
  assert.equal(bangumiSubjectId({ source_provider: "anilist", source_id: "456", title: "Example" }), "");
  assert.equal(bangumiSubjectId({ source_urls: ["https://malicious.site/subject/456"] }), "");
});

it("adds a new image session without rewriting the existing note body or first session", async () => {
  const h = harness(), library = new CharacterLibraryService(h.app, () => "AnimeList");
  const character = await library.collect({ name: "Example" });
  const first = h.markdown.get(character.path) ?? "";
  await library.createImageSession(character.path);
  const next = h.markdown.get(character.path) ?? "";
  assert.ok(next.startsWith(first));
  const { findImageSectionBlocks } = await import("../src/domain/image-section");
  assert.equal(findImageSectionBlocks(next).length, 2);
  assert.deepEqual(findImageSectionBlocks(next).map(block => block.paths), [[], []]);
});

it("removes only the selected character note and retains already linked image assets", async () => {
  const h = harness(), library = new CharacterLibraryService(h.app, () => "AnimeList");
  const character = await library.collect({ name: "Remove me", bangumiId: "700" });
  const asset = file("Assets/preserved.png");
  h.files.set(asset.path, asset);
  await library.attachImage(character.path, asset.path);
  await library.remove(character.path);
  assert.equal((await library.list()).length, 0);
  assert.equal(h.files.has(asset.path), true);
});

it("makes work links visible in previously saved character notes without touching personal notes", async () => {
  const h = harness(), library = new CharacterLibraryService(h.app, () => "AnimeList");
  const record = await library.collect({ name: "Earlier version", appearance: "Anime/A.md" });
  const source = h.markdown.get(record.path) ?? "";
  const older = source.replace(/<!-- animelist:character-works:start -->[\s\S]*?<!-- animelist:character-works:end -->\n\n/, "");
  h.markdown.set(record.path, older);
  await library.ensureVisibleWorks(record.path);
  assert.ok(h.markdown.get(record.path)?.includes("[[Anime/A.md]]"));
  await library.ensureVisibleWorks(record.path);
  const next = h.markdown.get(record.path) ?? "";
  assert.equal((next.match(/\[\[Anime\/A\.md\]\]/g) ?? []).length, 1);
});

it("adapts character ranking to existing media comparison modal with reversible persisted decisions", async () => {
  const content = new Map<string, string>();
  const app = { vault: { configDir: ".obsidian", adapter: {
    async exists(path: string) { return path === ".obsidian" || content.has(path); },
    async readBinary(path: string) { return new TextEncoder().encode(content.get(path) ?? "").buffer; },
    async writeBinary(path: string, data: ArrayBuffer) { content.set(path, new TextDecoder().decode(data)); },
  } } } as unknown as App;
  const store = new CharacterRankingStore(app);
  const adapter = new CharacterRankingAdapter(store);
  const empty = await adapter.load();
  assert.equal(empty.version, 1);
  assert.deepEqual(empty.anime.ordered, []);
  const chosen = await adapter.mutate(state => {
    state.anime.ordered = ["Characters/A.md"];
  });
  assert.deepEqual(chosen.anime.ordered, ["Characters/A.md"]);
  await adapter.mutate(state => {
    state.anime = { ...state.anime, ordered: [] };
  });
  assert.deepEqual((await store.load()).ordered, []);
});

it("links Gallery-sourced characters back to the originating work without duplicating their image", async () => {
  const h = harness(), library = new CharacterLibraryService(h.app, () => "AnimeList");
  const character = await library.collect({ name: "Example" });
  const image = file("Assets/one.png");
  h.files.set(image.path, image);
  await library.attachImage(character.path, image.path);
  await library.associateWork(character.path, "Anime/Source.md");
  await library.associateWork(character.path, "Anime/Source.md");
  const current = (await library.list()).find(entry => entry.id === character.id);
  assert.deepEqual(current?.appearances, ["Anime/Source.md"]);
  assert.ok(h.markdown.get(character.path)?.includes("[[Anime/Source.md]]"));
  assert.equal(h.files.size, 2);
});

it("sets a character cover only from its gallery and never changes the media cover field", async () => {
  const h = harness();
  const library = new CharacterLibraryService(h.app, () => "AnimeList");
  const character = await library.collect({
    name: "Kurumi", portrait: "https://example.com/old-cover.jpg",
  });
  h.files.set("Assets/one.png", file("Assets/one.png"));
  h.files.set("Assets/two.png", file("Assets/two.png"));
  await library.attachImage(character.path, "Assets/one.png");
  await library.attachImage(character.path, "Assets/two.png");

  assert.equal(await setCharacterGalleryCover(h.app, "AnimeList", character.path, "Assets/two.png"), true);
  assert.equal(h.metadata.get(character.path)?.character_portrait, "Assets/two.png");
  assert.equal(h.metadata.get(character.path)?.cover, undefined);
  assert.equal(h.metadata.get(character.path)?.user_defined, "keep");
  assert.equal(h.files.size, 3, "selecting a cover never duplicates artwork");
  await assert.rejects(
    setCharacterGalleryCover(h.app, "AnimeList", character.path, "Assets/not-collected.png"),
    /not in the character/,
  );
  assert.equal(h.metadata.get(character.path)?.character_portrait, "Assets/two.png");
  const media = file("Anime/Another.md");
  h.files.set(media.path, media);
  assert.equal(await setCharacterGalleryCover(h.app, "AnimeList", media.path, "Assets/one.png"), false);
});

it("routes a newly created Character gallery cover correctly before metadata indexing", async () => {
  const h = harness();
  const library = new CharacterLibraryService(h.app, () => "AnimeList");
  const character = await library.collect({ name: "New character" });
  const image = file("Assets/new-character.png");
  h.files.set(image.path, image);
  await library.attachImage(character.path, image.path);

  // Simulate Obsidian not yet having parsed YAML for a newly created file.
  const cached = h.app.metadataCache.getFileCache;
  h.app.metadataCache.getFileCache = () => null;
  try {
    const imageService = new ImageSectionService({
      app: h.app,
      settings: { libraryRoot: "AnimeList" },
      refreshViews() {},
    } as unknown as ConstructorParameters<typeof ImageSectionService>[0]);
    await imageService.setAsCover(character.path, image.path);
  } finally {
    h.app.metadataCache.getFileCache = cached;
  }

  assert.equal(h.metadata.get(character.path)?.character_portrait, image.path);
  assert.equal(h.metadata.get(character.path)?.cover, undefined,
    "an unindexed Character must never fall through to the media-cover field");
});

it("upgrades older Character markdown notes on first open without duplicate info blocks", async () => {
  const h = harness(), library = new CharacterLibraryService(h.app, () => "AnimeList");
  const record = await library.collect({ name: "Old note" });
  h.markdown.set(record.path, (h.markdown.get(record.path) ?? "").replace(
    String.fromCharCode(96).repeat(3) + "animelist-character\n" + String.fromCharCode(96).repeat(3) + "\n", "",
  ));
  await library.ensureVisibleWorks(record.path);
  await library.ensureVisibleWorks(record.path);
  const markdown = h.markdown.get(record.path) ?? "";
  assert.equal((markdown.match(/animelist-character/g) ?? []).length, 1);
  assert.ok(markdown.includes("# Old note"));
});
