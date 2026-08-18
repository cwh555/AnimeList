# Manual test checklist

Run this checklist before every public release and before any release-candidate merge that changes user-visible behavior. Feature-specific supplemental checklists may add detail; they do not replace this general gate.

## Clean installation

- [ ] Install only `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/animelist`.
- [ ] Enable the plugin without console errors.
- [ ] Open AnimeList from the ribbon.
- [ ] Open AnimeList from the command palette.
- [ ] Confirm the default `AnimeList` folders are created only when the library is opened or initialized.
- [ ] Reload Obsidian once and confirm commands, ribbons, views, Markdown processors, and context-menu actions are not duplicated.

## Storage

- [ ] Managed mode writes anime, manga, and novel notes into separate subfolders.
- [ ] Flat mode writes all media notes directly into the selected folder.
- [ ] A blank flat folder writes notes to the vault root.
- [ ] Additional scan folders show existing Markdown without moving it.
- [ ] Changing the cover folder affects newly downloaded covers.
- [ ] Changing the template folder affects the template selector.
- [ ] Existing notes, unrelated folders, and custom Markdown are not moved or rewritten during startup.

## Library UI

- [ ] Card view renders correct 2:3 covers.
- [ ] List view renders correct 2:3 covers without metadata wrapping over the poster.
- [ ] Compact view shows the edit button, rating badge, and favorite button.
- [ ] Compact rows never exceed the cover height; long titles and metadata end with an ellipsis instead of stretching the row.
- [ ] Compact covers appear promptly while scrolling quickly through a large library.
- [ ] The active view remains selected after editing or toggling a favorite.
- [ ] Search, media type, status, and the Filter dialog can be combined.
- [ ] Company filters collapse formatting-only duplicates (for example `A-1 Pictures` / `A-1Pictures`) into one readable option.
- [ ] Multiple Company and Tags selections require all selected values; Quarter remains single-select; the groups combine together.
- [ ] Stale persisted company, quarter, or tag filters are removed instead of hiding every Library item after metadata changes.
- [ ] Default sorting is newest completion date first.
- [ ] Recently updated sorting uses the file modification time.
- [ ] Long search results scroll with the outer modal only; the wheel continues through the full dialog without becoming trapped in a nested result pane.
- [ ] With release tracking disabled, manga/novel cards do not gain release controls or modify stored release state.
- [ ] With release tracking enabled, verified manga/novel cards show latest-release information without replacing personal progress.

## Create and edit

### Basic provider search

- [ ] Search works with Bangumi enabled alone.
- [ ] Search works with AniList enabled alone.
- [ ] Searching `輝夜姬想讓人告白第二季` returns the second season, and searching `輝夜姬想讓人告白 永不結束的初吻` returns the matching special through broader-title fallback.
- [ ] General novel search works with Open Library enabled.
- [ ] A title is always required.
- [ ] Planned and ongoing records can be saved with an empty score and empty completion date.
- [ ] Switching status to completed immediately makes score and completion date required.
- [ ] Completed status rejects an empty score, a score below 0 or above 10, and an empty completion date.
- [ ] Changing a completed record back to ongoing allows the score to be cleared and removes `score` from frontmatter.
- [ ] Date fields advance from a four-digit year to month, from a two-digit month to day, and leave the date after a two-digit day; invalid dates are not saved.
- [ ] Selected anime metadata shows format, a real animation-production studio, and quarter when available; generic production entities or malformed role-labelled strings are not displayed as the Company value.
- [ ] `青春ブタ野郎はバニーガール先輩の夢を見ない` and related tested entries resolve to CloverWorks after metadata refresh/cleanup.
- [ ] Re:Monster resolves to Studio DEEN / スタジオディーン rather than `制作:ジェンコ` or another producer role.
- [ ] Work-level tag chips append new tags, remove only from `×`, and preserve existing selected tags when another tag is added.

### Progress rules

- [ ] Completed anime synchronizes progress to its known episode total.
- [ ] Manga exposes only current chapter progress; there is no editable provider latest/total chapter field in the personal progress form.
- [ ] Marking manga completed leaves its current chapter unchanged.
- [ ] Novel current progress accepts whole volumes, `.5`, and `EX`; there is no editable provider latest/total volume field in the personal progress form.
- [ ] Marking a novel completed leaves its current volume unchanged.
- [ ] Duplicate novel volume labels are rejected after normalization (`01` and `1` are the same).
- [ ] Adding a novel volume pre-fills its completion date with today; clearing the field and saving restores today.

### Dated serial history and entry covers

- [ ] Manga and novels can create dated chapter, season, or volume rows using the selected progress unit.
- [ ] Adding a new row keeps existing rows sorted by normalized label, scrolls the new row into view, and focuses its label field.
- [ ] Tab moves through serial label → start date → completion date → Remove → next row → Add entry → Save.
- [ ] Plain Enter advances through serial text/date inputs; Enter on Remove, Add entry, and Save keeps the button action.
- [ ] Backspace moves to the previous ordered target only when the current input is empty, fully selected, or becomes empty after deleting its final character.
- [ ] Change a volume row from `10` to `2.5`, leave the field, and confirm it immediately moves between `2` and `3`; `EX` stays after numbered volumes.
- [ ] Each dated row shows its label, optional start date, completion date, entry-cover area, and remove action.
- [ ] Rapidly add several rows and confirm automatic cover requests show queued/loading state and run in insertion order without skipping an intermediate row.
- [ ] A failed automatic cover request does not block later queued rows and does not apply a low-confidence candidate.
- [ ] Open manual cover search and confirm the result cards contain no separate Select control and the modal contains no Apply action.
- [ ] Clicking anywhere on a candidate card immediately downloads and applies that cover, updates the row, and closes the search modal.
- [ ] If a selected cover download fails, the search modal remains open, controls become usable again, and another candidate can be chosen.
- [ ] Manual searches for `關於我被隔壁天使變成廢材這件事`, `不時以俄語遮羞的艾利同學`, and `冰菓` retain broad candidate lists while ranking the correct novel result near the top.
- [ ] Clearing an entry cover returns that row to the normal series-cover fallback without changing the library card cover.
- [ ] Saving writes `label`, optional `started_at`, non-empty `completed_at`, and optional cover metadata under `volume_log`.
- [ ] Close and reopen the editor; dated rows, selected entry covers, provider/source metadata, and unrelated entry fields remain unchanged.
- [ ] **Settings → Maintenance → Serial cover recovery** opens a floating progress modal with current item, progress bar, loaded/not-found/failed/skipped counters, cancellation, close protection, and copyable details.
- [ ] Loading missing covers never overwrites a dated entry that already has a cover.

### Notes and templates

- [ ] Built-in templates work without copying files into the vault.
- [ ] New built-in notes do not insert a second standalone `![[cover|260]]` body image below `animelist-detail`.
- [ ] Custom templates appear from Anime, Manga, Novel, and Common folders and are not rewritten to match the built-in template.
- [ ] Local series-cover download succeeds; remote series-cover fallback works when download fails.
- [ ] Editing a 1.0.3 note preserves its body and unrelated frontmatter fields.
- [ ] Deleting a record moves the Markdown file to the trash.

### Tags and legacy metadata

- [ ] **Settings → Features → Tags → Manage tags…** opens the localized Tag manager as a modal instead of expanding all tags in the Settings page.
- [ ] Tag manager search, Add tag, Rename, Delete tag, Cancel, and usage counts work with a large reusable catalog.
- [ ] Removing a tag with the `×` beside one work removes only that membership; the reusable tag and other work memberships remain.
- [ ] Renaming a tag updates every matching AnimeList note and merging into an existing tag does not create duplicate values.
- [ ] Global Delete tag removes the catalog entry and all matching work memberships without changing Obsidian `tags`, unrelated frontmatter, or Markdown body content.
- [ ] Back up/sync the test vault, then run **Settings → Updates & cleanup → Upgrade legacy metadata** against representative older and preview-era notes.
- [ ] Older notes remain readable before cleanup; cleanup backfills supported company/quarter metadata without losing source identity, progress, rating, custom frontmatter, or body content.
- [ ] Legacy `user_tags` and supported `classification_*` fields consolidate into canonical metadata without losing the selected work tags.

## Interface localization

- [ ] Switch **Interface language** among Traditional Chinese, English, Japanese, and Korean; Library, dialogs, notices, Image Sections, Moments, release tracking, Score Dashboard, Timeline, and reusable-tag UI update to the selected locale.
- [ ] Select **Follow Obsidian** and confirm a supported Obsidian locale is followed; an unsupported locale falls back safely.
- [ ] Settings remains entirely English under every AnimeList interface locale.
- [ ] Search-language settings remain independent from interface language.
- [ ] Existing known provider taxonomy tags such as `戀愛`, `校園`, or `動作` change display language without rewriting the stored frontmatter value.
- [ ] A custom tag such as `重看` remains unchanged when it is not part of the recognized provider taxonomy.
- [ ] Library filter tag labels and Edit-form tag chips localize for display while still filtering/saving the original stored values.
- [ ] Save an existing note after switching languages and confirm media titles, raw provider metadata, tags/frontmatter, note body, templates, Image Section paths, and Moment text are not translated or rewritten.

## Latest release tracking

Enable **Settings → Features → Latest release tracking** for these checks.

### General behavior

- [ ] Opening the release dashboard without pressing Refresh does not start an unexpected full provider refresh.
- [ ] Per-title refresh and Refresh All show stable progress and do not flicker or rebuild the Library unnecessarily.
- [ ] Disabling release tracking removes release UI without deleting personal reading progress.
- [ ] Enabling automatic checking does not rewrite user progress; disabling the feature also disables automatic checking.
- [ ] A provider error preserves the last trusted latest value and records/surfaces an attention state rather than clearing it.
- [ ] A genuinely lower provider result becomes `source_regressed` / attention and does not overwrite the trusted latest value.
- [ ] Ambiguous or unmatched titles require review rather than silently binding a guessed work.

### Manga source cases

- [ ] **碧藍之海 / ぐらんぶる** refresh reaches the current valid main chapter through the best available MangaDex/official evidence and shows the winning source provenance.
- [ ] **葬送的芙莉蓮** can use preserved AniList identity to discover the supported official public source and does not stop at stale MangaDex coverage when newer valid official evidence exists.
- [ ] **陰陽眼見子 / 見える子ちゃん** can use supported official-source evidence when available.
- [ ] **輝夜姬想讓人告白** keeps provider latest main chapter separate from fixture reading progress `281.1`; refresh must not rewrite the user's `progress`.
- [ ] **入間同學入魔了** keeps the higher valid MangaDex result when a supported official page is temporarily behind instead of forcing the official page to win.
- [ ] A feed containing whole chapter `281` plus supplementary `281.1` treats `281` as latest main chapter; a genuinely decimal-only feed may still keep a decimal latest value.

### Novel source cases

- [ ] **OVERLORD** resolves the numbered main publication line and reports the current main volume rather than a special/parallel edition.
- [ ] Re-check representative Toradora / 86 / Re:Zero fixtures so side publications, spin-offs, short stories, SS/SSS, Ex/Alter, gaiden/extra volumes, fanbooks, guides, and anthologies do not replace the main latest volume.
- [ ] Persisted verified NDL/JPRO binding/catalog information is reused when valid instead of broad-searching and rebinding on every refresh.

### Persistence safety

- [ ] Release refresh may update only release-tracking/latest-release fields; `progress`, `progress_unit`, `volume_log`, personal status, score, tags, unrelated frontmatter, and Markdown body remain unchanged.
- [ ] Close/reopen the note and restart Obsidian; verified release state and source provenance remain stable.


## AnimeList workspace and Images

- [ ] The native AnimeList ItemView shows one primary navigation row in this exact order: **Library → Timeline → Score Dashboard → Images**. Switching pages reuses the same ItemView instead of opening a modal or another Obsidian tab.
- [ ] Primary navigation is visually different from page-local filters: the workspace row is flat/underlined with icon + label, while Library/Images filters remain smaller page-local controls. On mobile the workspace row remains visible and horizontally scrollable.
- [ ] The AnimeList header shows only the product name; the old Markdown-description subtitle is absent.
- [ ] The top-level workspace navigation has no vertical scrollbar. Optional **More** may remain at its far right; Timeline, Score Dashboard, and Images are not duplicated as header buttons. When Latest release tracking is enabled, **Release Updates** is available from **More** instead.
- [ ] In **Library**, **Collect** is on the same row as **All / Anime / Manga / Novel**, aligned to the far right; it is not shown as a global workspace action on Timeline, Score Dashboard, or Images.
- [ ] Library retains its existing All/Anime/Manga/Novel, status, search, filter, sort, and Grid/List/Poster behavior inside the Library page. The standalone Markdown `animelist` block retains its existing self-contained header/actions.
- [ ] Timeline opened from either the workspace tab or command uses the shared AnimeList page and preserves existing timeline filters/scale/navigation.
- [ ] Score Dashboard opened from either the workspace tab or command uses the shared AnimeList page and preserves score lanes, drag/batch operations, zoom, filtering, and mobile interactions.
- [ ] Images → **All images** aggregates existing `animelist-images` references across works without creating/copying/moving any image file. One image reused by multiple Image Sections in the same work appears once in the work-level aggregate.
- [ ] Images media-type filter, search, and exact 1–6 column slider work on desktop and mobile. Lightbox previous/next follows the currently filtered gallery, including images whose source files belong to different media notes.
- [ ] Images → **All images / By work** uses a clearly segmented page-local switch that does not resemble the flat top-level workspace tabs.
- [ ] Landscape screenshots render at their natural aspect ratio; Obsidian's default button height must not clip aggregate gallery images into thin strips.
- [ ] Images → **By work** cards expand to their full preview mosaic and metadata height instead of inheriting Obsidian's normal button height.
- [ ] Images → **By work** shows one board per work with correct unique-image and Image Session counts. Opening a board exposes **All sessions / Session N**, and **Open source work** opens the owning media note.
- [ ] Edit, reorder, add, or remove an original Image Section reference, then return to/refresh Images and confirm the aggregate updates without a Vault-wide Markdown scan or duplicated asset. Rename/delete a media note and confirm stale work entries disappear.
- [ ] A work with an empty Image Section does not create an empty board; an entirely empty aggregate shows the safe empty state. Large galleries progressively append image DOM instead of rendering every image eagerly.

## Image Sections

Use the editor context menu **AnimeList → Add image section**.

- [ ] The native **AnimeList** submenu behaves like an Obsidian submenu; if native submenu support is unavailable, the safe flat fallback action remains usable.
- [ ] Inserting an Image Section at the cursor preserves surrounding Markdown and creates an ordinary `animelist-images` fenced block.
- [ ] Multiple independent Image Sections may exist in one note; editing one does not rewrite another.
- [ ] Empty Image Section shows an Add target and accepts file picker, drag/drop, clipboard paste, and explicit URL import.
- [ ] A populated desktop Image Section uses independent masonry columns with uncropped natural-height images; a short image does not reserve the height of a taller neighbor and the next image rises to fill that column.
- [ ] **Image columns** defaults to 4; the discrete 1–6 slider previews immediately, persists the selected per-section value, and reopening the note restores it.
- [ ] Desktop/narrow layouts keep the exact requested 1–6 column count without page-level horizontal overflow; the plugin must not silently reduce the selected value.
- [ ] Drag an image within one Image Section to reorder it; reopening the note preserves the new Markdown list order.
- [ ] Drag an image between two Image Sections in the same note; the source loses the reference, the target gains it at the drop position, unrelated Markdown between sections is unchanged, and the image file is not trashed.
- [ ] Bounded gallery scrolling works and **Show all / Show less** expands/collapses without an unexpected viewport jump.
- [ ] Click an image → original-image lightbox; ArrowLeft/ArrowRight navigate only that section; Esc closes.
- [ ] Cmd+C (macOS) / Ctrl+C (Windows/Linux) in the lightbox copies the original image; context-menu **Copy image** also works.
- [ ] **Set as cover** updates the media cover while leaving the Image Section reference intact.
- [ ] Shift-click enters selection mode; selecting multiple images and Delete removes only the chosen references.
- [ ] Add the exact same image under another filename to the same section → duplicate is skipped.
- [ ] Copy/paste an existing supported raster image back into the same section → an exact canonical-raster duplicate is skipped even if clipboard encoding changed.
- [ ] Add the same image to a different Image Section or Moment → allowed.
- [ ] Thumbnail cache under the plugin cache may be generated for gallery display, while lightbox/copy still use original Vault files.
- [ ] Deleting an image does not trash a managed file while another cover, Image Section, or Moment still references it.
- [ ] Missing image paths render a safe placeholder instead of breaking the whole section.

## Moments

Use the editor context menu **AnimeList → Add moments section** and also complete `docs/MOMENTS_TEST_VAULT.md`.

- [ ] Inserting a Moments section preserves surrounding Markdown and creates `animelist-moments` with `moments: []`.
- [ ] Create requires non-empty text and at least one image.
- [ ] Add Moment images by file picker, drag/drop, clipboard paste, and URL.
- [ ] Edit `source`, `position`, `speaker`, `tags`, and `note`; only populated optional fields are serialized/rendered.
- [ ] Editing a Moment preserves its stable `id`.
- [ ] Multiple Moments blocks in the same note remain independent.
- [ ] One-image Moment displays a large uncropped featured stage; no horizontal scrollbar is needed for the single image.
- [ ] Multi-image Moment keeps one horizontal row by default; overflow scrolls horizontally and images do not wrap or crop.
- [ ] Switch a 2+ image Moment to **Stacked**: the first image stays expanded and later original images expose subtitle strips without creating a composite PNG or duplicate image files.
- [ ] In the Moment editor, change stacked subtitle reveal height and drag each exposed lower strip vertically with both mouse and touch; save/reopen and confirm the manual crop positions persist.
- [ ] Switch Stacked back to Carousel and confirm image order/files remain unchanged; reducing to one image falls back to the existing featured-image layout.
- [ ] Horizontal scrolling remains usable with native/WebKit scrollbar behavior and does not depend on `scrollbar-width` / `scrollbar-color`.
- [ ] Long quote/note content exposes the shared Expand/Collapse behavior and returns to the compact state after collapse.
- [ ] Lightbox navigation remains scoped to the current Moment.
- [ ] Copy text / Copy images work.
- [ ] Deleting a Moment preserves an image still referenced by another Moment, Image Section, or cover.
- [ ] Interface-language switching changes controls/labels only; stored quote text, tags, notes, image paths, and IDs remain unchanged.

## Settings layout and update cleanup

### Top-level pages

- [ ] Settings top tabs appear in this order: **General → Search & metadata → Features → Maintenance → Updates & cleanup**.
- [ ] Mouse click and Arrow/Home/End keyboard navigation switch/focus tabs correctly.
- [ ] Same-page sections are visibly grouped with clear headings and flat setting rows.
- [ ] General contains Interface, Library & storage, File locations, and Timeline groups.
- [ ] Search & metadata contains Search languages and Metadata providers.
- [ ] Features contains optional feature groups such as Latest release tracking, serial-cover lookup, Tags, and Favorite/Masterpiece behavior.
- [ ] Maintenance contains recurring repair/setup actions such as serial-cover recovery and library setup.
- [ ] Updates & cleanup contains review-first version/update cleanup actions.
- [ ] Managed/flat storage switching keeps the current tab and does not leave an empty/broken section.
- [ ] Existing setting values survive tab switching and plugin restart; the selected tab itself does not need to persist.

### Remove duplicate note covers

- [ ] Prepare a controlled old generated note whose exact `![[cover-path|260]]` immediately after `animelist-detail` matches current `cover` frontmatter.
- [ ] **Updates & cleanup → Remove duplicate note covers → Review** lists the exact candidate before mutation.
- [ ] Cancel changes nothing.
- [ ] Confirm removes only that generated duplicate body-cover line.
- [ ] A second scan finds no remaining candidate for the cleaned note.
- [ ] A custom-template image, a body image at another location, an ambiguous path, or an image not exactly matching `cover` is skipped.
- [ ] Cleanup preserves frontmatter, Image Sections, Moments, unrelated embeds, and note prose.

## Timeline

- [ ] Timeline opens as the top-level **Timeline** workspace page and its canvas has a non-zero usable viewport height.
- [ ] Switch Library → Timeline → Images → Timeline; timeline cards and controls remain visible after every remount.
- [ ] The All, Anime, Manga, and Novel buttons show only their matching completion records and update the summary count/date range.
- [ ] A type with no matching records keeps the filter buttons visible so another type can be selected.
- [ ] Completed anime/manga and legacy completed novels appear when they have a completion date.
- [ ] Every saved dated chapter, season, or volume row appears on the timeline because missing completion dates default to today.
- [ ] A dated-entry card uses its own cover when available and falls back to the normal series cover when the entry cover is absent or cannot be resolved.
- [ ] Every dated-entry card visibly shows the work title and its chapter, season, or volume label.
- [ ] Records on the same or nearby dates move into alternating vertical lanes and do not overlap at fit, zoomed-in, or zoomed-out scales.
- [ ] Records completed on the same date are grouped by naturally sorted title, so related numbered works and serial entries appear in `1`, `2`, `3` order.
- [ ] Dragging pans the timeline.
- [ ] Date-spacing controls change horizontal time distance without resizing cards.
- [ ] Visual-size controls independently shrink and enlarge the complete timeline scene.
- [ ] Fit shows all completion dates at the selected visual size.
- [ ] Selecting a poster opens the media note.

## Score Dashboard

- [ ] All / Anime / Manga / Novel filters work and unrated visibility can be toggled.
- [ ] Direct drag moves one item to another score lane or Unrated.
- [ ] Shift-click enters batch mode and selects the clicked item immediately.
- [ ] Dragging one selected item moves the full selected batch.
- [ ] Direct batch score and ±0.5 adjustments work; unrated items block relative adjustment until assigned a score.
- [ ] Out-of-range batch moves require confirmation and clamp to 0–10.
- [ ] Opening the dashboard does not eagerly generate thumbnails for every library poster.

## Mobile / narrow layouts

- [ ] Library controls remain usable on iOS or Android with touch-sized primary actions.
- [ ] Card/poster view becomes a usable two-column cover-first layout on phones; list view does not overflow horizontally; tablet/desktop layouts remain unchanged.
- [ ] Type/status controls and applicable score/timeline lanes can be swiped horizontally without clipping their content.
- [ ] Add and edit dialogs are near-full-screen, single-column, scrollable, and keep serial-entry actions reachable.
- [ ] Tag Manager and Library Filter modals fit the phone viewport without horizontal overflow.
- [ ] Settings tabs and same-page groups remain readable in a narrow Settings pane.
- [ ] Image Sections fit the note width with responsive grid columns; controls remain reachable by touch.
- [ ] Moments keep media first, then quote, then metadata with no page-level horizontal overflow.
- [ ] Timeline uses full-screen mobile chrome and its toolbar controls are usable without a mouse.
- [ ] Local covers and note-media images load after sync; opening the Score Dashboard does not eagerly generate thumbnails for every poster.

## Final data-safety pass

- [ ] Compare representative notes before/after ordinary edit, release refresh, Image Section edit, Moment edit, legacy metadata cleanup, and duplicate-cover cleanup.
- [ ] Each operation changes only its owned fields/block and preserves unrelated frontmatter/body content.
- [ ] No optional 1.4 feature performs a vault-wide automatic rewrite on startup.
- [ ] Disabling optional features leaves stored Markdown readable and does not delete user data.
