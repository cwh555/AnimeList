# Characters (feature preview)

Characters is an opt-in collection **inside AnimeList**, not a separate plugin.

## Usage

1. Open AnimeList → **Characters** → **Add character** to search Bangumi or add a character manually. Each selected character occupies one cover card, like Library.
2. On a media note, select **View / collect characters** under the detail block. A work with a verified Bangumi subject ID offers its cast. Without an ID, search by character name or add manually.
3. Select a card to choose Like/Love/Favorite, follow related AnimeList works, import images, change the character portrait, or open the underlying Markdown note.
4. The character note contains a standard \`animelist-images\` Markdown block and works with the existing Image Section and Lightbox. No automatically discovered character is collected without a user action.

## Data and compatibility

Records are separate Markdown notes under \`<libraryRoot>/Characters/character-<UUID>.md\`, marked \`animelist_character: true\`. They have no \`media_type\` and therefore cannot pollute anime/manga/novel lists. Stable local IDs and confirmed Bangumi character IDs are tracked independently; identical names alone are not treated as proof of identity. Appearance paths reference the original media notes. Existing media notes, ratings, rank evidence and Image Sections are not migrated or rewritten.

## Deliberate limitations

- External filesystem paths outside the Obsidian vault are not supported yet, especially for mobile. Uploaded images are copied into the Vault through AnimeList's existing Image Section service.
- Automatic work cast lookup requires a verified Bangumi subject ID. No title-only cross-provider matching is performed.
- The shared Images gallery and Ranking have not yet acquired character-specific filters. Character images are accessible via the Character page and existing Image Sections.
- Work note rename and relocation handling for stored appearance paths is not part of this first preview. Character identity itself is stable.
- This is not a release. Desktop and mobile test vault acceptance is still required.

## Manual test-vault checklist

1. Open Characters in an empty vault; create a manual character, close and reopen the plugin, and confirm it remains.
2. Load the cast of a known Bangumi work; add a main and a supporting character, and confirm only these two are collected.
3. Collect the same Bangumi character from two works; confirm no duplicate and both appearances are visible.
4. Change all three preference levels and reload; check the data persists.
5. Import JPG / PNG / WebP images into a character and choose a new portrait. Open Lightbox, then edit the image list in the character Markdown note.
6. Check empty sections, offline/error behavior, desktop card layout, mobile scrolling and touch behavior.
7. Regress Library, Timeline, Scoreboard, Ranking, Images, export and ordinary work notes.

Do not merge without feature CI and explicit user approval.
