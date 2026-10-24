import assert from "node:assert/strict";
import { it } from "node:test";
import { TFile, type App } from "obsidian";
import { CharacterLibraryService } from "../src/data/character-library-service";
import { CharacterRankingStore } from "../src/data/characters/ranking-store";
import { characterRankingItems } from "../src/domain/characters/ranking-items";
import type { CharacterRecord } from "../src/domain/characters/character";
import { emptyRankingCollection, nextRankingPair, prepareRankingRounds, decideRanking,
  rankingPositionProjection } from "../src/domain/pairwise-ranking";
import { externalImageUri, localPathFromImageUri } from "../src/domain/characters/external-image";

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
  data.set(".obsidian/animelist-character-ranking.json", "external-change");
  await assert.rejects(store.mutate(ranking => { ranking.ordered.push("Char/B.md"); }), /changed on another device/);
});
