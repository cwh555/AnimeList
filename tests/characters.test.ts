import { strict as assert } from "node:assert";
import { it } from "node:test";
import {
  characterFromFrontmatter, characterNoteSource, characterTier,
  characterCollectionAction, findExistingCharacter, mergeCharacterAppearances,
  syncCharacterWorks, ensureCharacterCardBlock,
  type CharacterRecord,
} from "../src/domain/characters/character";
import { bangumiCharacterCandidate } from "../src/data/providers/bangumi-character-client";

it("keeps user-selected character identity across seasons and avoids name-based merging", () => {
  const existing: CharacterRecord = {
    id: "uuid", path: "AnimeList/Characters/character-uuid.md",
    name: "角色甲", tier: "top", bangumiId: "123", portrait: "",
    appearances: ["Anime/s1.md"],
  };
  assert.equal(findExistingCharacter([existing], { name: "different", bangumiId: "123" }), existing);
  assert.equal(findExistingCharacter([existing], { name: "角色甲", bangumiId: "456" }), undefined);
  assert.equal(findExistingCharacter([existing], { name: "角色甲" }), undefined);
  assert.deepEqual(mergeCharacterAppearances(existing.appearances, "Anime/s2.md"), ["Anime/s1.md", "Anime/s2.md"]);
  assert.deepEqual(mergeCharacterAppearances(existing.appearances, "Anime/s1.md"), ["Anime/s1.md"]);
});
it("writes a character note with stable identity and an image session without a media type", () => {
  const text = characterNoteSource("stable-id", {
    name: '鈴木: "A"', bangumiId: "28", appearance: "Anime/Test.md",
  });
  assert.match(text, /animelist_character: true/);
  assert.match(text, /character_id: "stable-id"/);
  assert.match(text, /character_name: "鈴木: \\"A\\""/);
  assert.match(text, /character_appearances:\n  - "Anime\/Test.md"/);
  assert.match(text, /animelist-images/);
  assert.doesNotMatch(text, /^media_type:/m);
  const from = characterFromFrontmatter({
    animelist_character: true, character_id: "stable-id",
    character_name: "鈴木", character_tier: "high", bangumi_character_id: "28",
    character_appearances: ["Anime/Test.md", "Anime/Test.md"],
  }, "AnimeList/Characters/stable.md");
  assert.deepEqual(from?.appearances, ["Anime/Test.md"]);
  assert.equal(from?.tier, "high");
  assert.equal(characterTier("bad"), "liked");
});
it("normalizes Bangumi character candidates and tolerates missing images", () => {
  assert.deepEqual(bangumiCharacterCandidate({ id: 9, name: "Test", images: { medium: "https://example.org/a.jpg" }, relation: "主角" }, "Anime/a.md"), {
    name: "Test", bangumiId: "9", portrait: "https://example.org/a.jpg",
    relation: "主角", appearance: "Anime/a.md",
  });
  assert.equal(bangumiCharacterCandidate({ id: null, name: "Test" }), null);
  assert.equal(bangumiCharacterCandidate({ id: 5, name: "" }), null);
});

it("uses a real Image Section block for character notes, not a separate image store", async () => {
  const { findImageSectionBlocks } = await import("../src/domain/image-section");
  const note = characterNoteSource("identifier", { name: "Char" });
  const blocks = findImageSectionBlocks(note);
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].paths, []);
});

it("allows a collected character to be linked to another work without enabling duplicate collection", () => {
  const existing: CharacterRecord = {
    id: "local", path: "Characters/uuid.md", name: "Original", tier: "liked",
    bangumiId: "77", portrait: "", appearances: ["Anime/season1.md"],
  };
  assert.equal(characterCollectionAction([existing], {name: "Alias", bangumiId: "77", appearance: "Anime/season2.md"}), "link");
  assert.equal(characterCollectionAction([existing], {name: "Alias", bangumiId: "77", appearance: "Anime/season1.md"}), "collected");
  assert.equal(characterCollectionAction([existing], {name: "Alias", bangumiId: "77"}), "collected");
  assert.equal(characterCollectionAction([existing], {name: "Original", bangumiId: "88", appearance: "Anime/season2.md"}), "collect");
});

it("retains unrelated Markdown and links known works visibly in the character note", () => {
  const fence = String.fromCharCode(96).repeat(3);
  const original = ["---", "custom: true", "---", "# Character", "", "Notes.", "", fence + "animelist-images", "- Assets/a.png", fence, ""].join("\n");
  const one = syncCharacterWorks(original, ["Anime/First Season.md"]);
  assert.ok(one.includes("[[Anime/First Season.md]]"));
  assert.ok(one.includes("Notes."));
  assert.ok(one.includes(fence + "animelist-images\n- Assets/a.png\n" + fence));
  assert.equal(syncCharacterWorks(one, ["Anime/First Season.md"]), one);
  const two = syncCharacterWorks(one, ["Anime/Second Season.md"]);
  assert.ok(!two.includes("[[Anime/First Season.md]]"));
  assert.ok(two.includes("[[Anime/Second Season.md]]"));
  assert.ok(two.includes("custom: true"));
});

it("upgrades old character notes with exactly one native info card without altering user text", () => {
  const source = "---\nother: keep\n---\n# Character\n\nPersonal notes.\n";
  const once = ensureCharacterCardBlock(source);
  assert.ok(once.includes("animelist-character"));
  assert.equal(ensureCharacterCardBlock(once), once);
  assert.ok(once.includes("Personal notes."));
  assert.ok(once.includes("other: keep"));
});
