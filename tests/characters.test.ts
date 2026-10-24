import { strict as assert } from "node:assert";
import { it } from "node:test";
import {
  characterFromFrontmatter, characterNoteSource, characterTier,
  findExistingCharacter, mergeCharacterAppearances,
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
