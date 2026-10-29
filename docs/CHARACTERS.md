# Characters — Feature Acceptance

> **待使用者實際驗收。** Characters 已整合到 AnimeList 工作區。圖片封面一律從角色 Image Sections 的「⋯ → 設為封面」操作選取，不額外建立選圖器。完成 Desktop／Mobile test vault 驗收前，不合併此功能。

Characters is integrated into the AnimeList workspace, not a separate plugin. It shows **one cover card per collected character**, like Library, without a Graph View, achievements, forced completion goals, or an independent image engine.

## Entry points and workflow

1. **Characters:** open the main tab, search Bangumi characters or add names manually; only selected characters enter your collection. Clicking a character cover opens its underlying Obsidian note, **exactly like an AnimeList Library card**. The small pencil action opens a compact AnimeList editor for name and collection tier. For cover changes, use **the existing Image Section image menu → Set as cover** from that character note; the editor links directly to the note and has no second gallery or upload panel.
2. **Library media note:** inside the existing work detail card, use the Characters row and select "瀏覽角色" to see an on-demand Bangumi cast list (when a verified subject ID or Bangumi subject URL exists), or search manually. Selected characters appear as portrait links **inside the same work detail card**, and the character Markdown note gets visible `[[work-note]]` backlinks in a bounded managed section. The same verified Bangumi character appearing in different seasons remains one entry.
3. **Images:** each image in the existing Gallery has an action to link that image into an existing character or create a character first, without copying the same image file.

The Characters tab offers a cover-card **Library**, mixed-character **Images Gallery**, and **Ranking**. The single-character picture experience is the character's Obsidian note and the existing Image Section display, not a parallel photo-management page. From the existing Scoreboard → Ranking panel, choose "Characters" to enter character comparisons. The sorting uses **the same AnimeList ranking comparison dialog**, including undo, pause, skip, progress and possible-rank intervals; it also shares strict pairwise evidence and transitive reasoning; character ranking is stored separately from all media rankings.

Characters are represented by standard Obsidian Markdown notes and existing Image Sections, not a duplicate character-detail workspace. The editor handles name and tier; it displays the current cover and has one direct action to open the character note for artwork. Existing Image Sections handle uploading, image sessions, choosing a cover, and viewing images. Desktop local file references can still be entered via Image Section paths, but may be unavailable on Mobile. Standard Image Sections and Image Lightbox remain available, including multiple manually arranged image sections.

## Storage and backwards compatibility

- Removing a character uses Obsidian Trash for the character note and does not delete shared image files. The delete event also removes its independent Character Ranking evidence.
- Character notes are created only after an explicit user action under `<libraryRoot>/Characters/character-<UUID>.md`.
- `animelist_character: true` and stable local UUID identify the note; optional Bangumi ID is separate. Characters have **no** `media_type` and are ignored by Anime/Manga/Novel indexing.
- Character metadata lives in YAML; images are stored as references in standard `animelist-images` Markdown blocks. Existing media notes are not migrated, and unrelated frontmatter and body contents remain untouched.
- Pairwise character state is stored in `.obsidian/animelist-character-ranking.json` with optimistic write conflict detection. Existing `animelist-ranking.json` is unchanged.
- Work-note renames update stored character appearance links **and visible Markdown backlinks**; character-note renames update ranking paths. Older character notes are populated with missing work links on first open, without replacing unrelated body content.
- Local image upload **copies** the image into the Vault via the existing Image Section service. Linking an existing Gallery image references it without copying. On Desktop only, users can also paste an absolute file path and choose **Link without copying**; it is converted to a local `file:` URL in the note. Local bytes are read through a Desktop bridge only and never uploaded to providers. Mobile cannot load that file reference, and should show the missing-image state instead. Source files remain untouched.

## Verification

Unit and integration tests cover stable character identity, source normalization, image references, strict ranking and conflict-safe persistence. The branch must pass `npm ci`, `npm run check`, and `npm run release:check`.

Manual Desktop / Mobile test-vault checklist:

- Empty Character Library; manual addition; Bangumi search; verified work cast; no unselected character collected.
- Same verified character from two seasons is not duplicated; conflicting same-name identities remain separate.
- Portrait fallback on broken or missing URLs; **no cropping of tall/full-body illustrations**; compact one-item desktop grid; compact editor's gallery shortcut opens the character note, where the existing Image Section menu selects a saved or newly uploaded cover; **card click opens the note**, pencil opens the editor, Manage Images opens the note. Verify real work-title labels and bidirectional links.
- JPG/PNG/WebP image imports, existing Gallery image assignment without duplication, image Lightbox, image section reorder, multiple sessions, mixed-character Gallery, and mobile gallery scrolling.
- Characters Ranking: first compare, skip, resume, full rerank, exact positions and possible ranges; existing media Ranking unchanged.
- Desktop `file:` references without copying, after app reload; confirm Mobile displays an unavailable-image placeholder rather than pretending to sync.
- Regression: existing Library / Timeline / Scoreboard / Ranking / Images / Export and images in media notes.

**Do not merge before user review and approval.**
