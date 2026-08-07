# Manual test checklist

Run this checklist before every public release and before the initial Community Plugins submission.

## Clean installation

- [ ] Install only `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/animelist`.
- [ ] Enable the plugin without console errors.
- [ ] Open AnimeList from the ribbon.
- [ ] Open AnimeList from the command palette.
- [ ] Confirm the default `AnimeList` folders are created only when the library is opened or initialized.

## Storage

- [ ] Managed mode writes anime, manga, and novel notes into separate subfolders.
- [ ] Flat mode writes all media notes directly into the selected folder.
- [ ] A blank flat folder writes notes to the vault root.
- [ ] Additional scan folders show existing Markdown without moving it.
- [ ] Changing the cover folder affects newly downloaded covers.
- [ ] Changing the template folder affects the template selector.

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
- [ ] Manga exposes only current chapter progress; there is no latest/total chapter field.
- [ ] Marking manga completed leaves its current chapter unchanged.
- [ ] Novel current progress accepts whole volumes, `.5`, and `EX`; there is no latest/total volume field.
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
- [ ] **Settings → Load missing covers** opens a floating progress modal with current item, progress bar, loaded/not-found/failed/skipped counters, cancellation, close protection, and copyable details.
- [ ] Loading missing covers never overwrites a dated entry that already has a cover.

### Notes and templates

- [ ] Built-in templates work without copying files into the vault.
- [ ] Custom templates appear from Anime, Manga, Novel, and Common folders.
- [ ] Local series-cover download succeeds; remote series-cover fallback works when download fails.
- [ ] Editing a 1.0.3 note preserves its body and unrelated frontmatter fields.
- [ ] Deleting a record moves the Markdown file to the trash.

### Tags and legacy metadata

- [ ] **Settings → Tags → Manage tags…** opens the English Tag manager as a modal instead of expanding all tags in the Settings page.
- [ ] Tag manager search, Add tag, Rename, Delete tag, Cancel, and usage counts work with a large reusable catalog.
- [ ] Removing a tag with the `×` beside one work removes only that membership; the reusable tag and other work memberships remain.
- [ ] Renaming a tag updates every matching AnimeList note and merging into an existing tag does not create duplicate values.
- [ ] Global Delete tag removes the catalog entry and all matching work memberships without changing Obsidian `tags`, unrelated frontmatter, or Markdown body content.
- [ ] Back up/sync the test vault, then run **Settings → Legacy metadata cleanup → Scan and upgrade** against representative 1.2.1 and preview-era notes.
- [ ] Stable 1.2.1 notes remain readable before cleanup; cleanup backfills supported company/quarter metadata without losing source identity, progress, rating, custom frontmatter, or body content.
- [ ] Legacy `user_tags` and supported `classification_*` fields consolidate into canonical metadata without losing the selected work tags.

## Timeline

- [ ] The timeline opens in a floating modal instead of replacing the library view.
- [ ] The modal closes from the title-bar close button, the Escape key, and the backdrop.
- [ ] The **所有**, **動畫**, **漫畫**, and **小說** buttons show only their matching completion records and update the summary count and date range.
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

## Mobile

- [ ] Library controls remain usable on iOS or Android with touch-sized primary actions.
- [ ] Card/poster view becomes a usable two-column cover-first layout on phones; list view does not overflow horizontally; tablet/desktop layouts remain unchanged.
- [ ] Type/status controls and applicable score/timeline lanes can be swiped horizontally without clipping their content.
- [ ] Add and edit dialogs are near-full-screen, single-column, scrollable, and keep serial-entry actions reachable.
- [ ] Tag Manager and Library Filter modals fit the phone viewport without horizontal overflow.
- [ ] Timeline uses full-screen mobile chrome and its toolbar controls are usable without a mouse.
- [ ] Local covers load after sync and opening the Score Dashboard does not eagerly generate thumbnails for every poster.
