# Characters — Feature Preview

Characters is integrated into the AnimeList workspace, not a separate plugin. It shows **one cover card per collected character**, like Library, without a Graph View, achievements, forced completion goals, or an independent image engine.

## Entry points and workflow

1. **Characters:** open the main tab, search Bangumi characters or add names manually; only selected characters enter your collection. Each card opens its profile.
2. **Library media note:** beneath the media detail block, choose "View / collect characters" to see an on-demand Bangumi cast list (when a verified subject ID or Bangumi subject URL exists), or search manually. Selected characters link back to the work. The same verified Bangumi character appearing in different seasons remains one entry.
3. **Images:** each image in the existing Gallery has an action to link that image into an existing character or create a character first, without copying the same image file.

The Characters tab offers a local cover-card **Library**, mixed-character **Images Gallery** (also supports browsing by character/section) and **Ranking**. From the existing Scoreboard → Ranking panel, choose "Characters" to enter character comparisons. The sorting uses the existing strict pairwise evidence, skips, transitive reasoning and possible-rank intervals; character ranking is stored separately from all media rankings.

Within a character, set the three-level preference, change the display name, choose the cover image, see linked media, add images, and open the underlying Markdown note. Standard Image Sections and Image Lightbox remain available, including multiple manually arranged image sections.

## Storage and backwards compatibility

- Character notes are created only after an explicit user action under `<libraryRoot>/Characters/character-<UUID>.md`.
- `animelist_character: true` and stable local UUID identify the note; optional Bangumi ID is separate. Characters have **no** `media_type` and are ignored by Anime/Manga/Novel indexing.
- Character metadata lives in YAML; images are stored as references in standard `animelist-images` Markdown blocks. Existing media notes are not migrated, and unrelated frontmatter and body contents remain untouched.
- Pairwise character state is stored in `.obsidian/animelist-character-ranking.json` with optimistic write conflict detection. Existing `animelist-ranking.json` is unchanged.
- Work-note renames update stored character appearance links, and character-note renames update ranking paths.
- Local image upload **copies** the image into the Vault via the existing Image Section service. Linking an existing Gallery image references it without copying. On Desktop only, users can also paste an absolute file path and choose **Link without copying**; it is converted to a local `file:` URL in the note. Local bytes are read through a Desktop bridge only and never uploaded to providers. Mobile cannot load that file reference, and should show the missing-image state instead. Source files remain untouched.

## Verification

Unit and integration tests cover stable character identity, source normalization, image references, strict ranking and conflict-safe persistence. The branch must pass `npm ci`, `npm run check`, and `npm run release:check`.

Manual Desktop / Mobile test-vault checklist:

- Empty Character Library; manual addition; Bangumi search; verified work cast; no unselected character collected.
- Same verified character from two seasons is not duplicated; conflicting same-name identities remain separate.
- Portrait fallback on broken or missing URLs; rename display name; three preference levels; note reload; work links.
- JPG/PNG/WebP image imports, existing Gallery image assignment without duplication, image Lightbox, image section reorder, multiple sessions, mixed-character Gallery, and mobile gallery scrolling.
- Characters Ranking: first compare, skip, resume, full rerank, exact positions and possible ranges; existing media Ranking unchanged.
- Desktop `file:` references without copying, after app reload; confirm Mobile displays an unavailable-image placeholder rather than pretending to sync.
- Regression: existing Library / Timeline / Scoreboard / Ranking / Images / Export and images in media notes.

**Do not merge before user review and approval.**
