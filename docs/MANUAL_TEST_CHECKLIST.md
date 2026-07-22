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
- [ ] Search, media type, status, and genre filters can be combined.
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
- [ ] Planned, watching/reading, and on-hold records can be saved with an empty score and empty completion date.
- [ ] Switching status to completed immediately makes score and completion date required.
- [ ] Completed status rejects an empty score, a score below 0 or above 10, and an empty completion date.
- [ ] Changing a completed record back to active allows the score to be cleared and removes `score` from frontmatter.
- [ ] Date fields advance from a four-digit year to month, from a two-digit month to day, and leave the date after a two-digit day; invalid dates are not saved.

### Progress rules

- [ ] Completed anime synchronizes progress to its known episode total.
- [ ] Manga exposes only current chapter progress; there is no latest/total chapter field.
- [ ] Marking manga completed leaves its current chapter unchanged.
- [ ] Novel current progress accepts whole volumes, `.5`, and `EX`; there is no latest/total volume field.
- [ ] Marking a novel completed leaves its current volume unchanged.
- [ ] Duplicate novel volume labels are rejected after normalization (`01` and `1` are the same).
- [ ] Adding a novel volume pre-fills its completion date with today; clearing the field and saving restores today.

### Novel volume history and series cover

- [ ] Creating a novel from Bangumi or AniList downloads the normal series cover and shows it on the library card.
- [ ] Open a novel with several recorded volumes and select **新增一卷**. Existing rows stay sorted by normalized volume number, the modal scrolls the new row into view, and the volume-label field receives focus with its generated label selected.
- [ ] Change a row from volume `10` to `2.5`, leave the field, and confirm it immediately moves between `2` and `3`; `EX` stays after numbered volumes.
- [ ] Each volume row contains only volume number, optional start date, completion date, and **移除**.
- [ ] Saving writes `label`, optional `started_at`, and a non-empty `completed_at` under `volume_log`.
- [ ] There is no per-volume cover picker, ISBN metadata, Rakuten setting, or novel-volume cover API request.
- [ ] The library card continues using the normal series cover.

### Notes and templates

- [ ] Built-in templates work without copying files into the vault.
- [ ] Custom templates appear from Anime, Manga, Novel, and Common folders.
- [ ] Local series-cover download succeeds; remote series-cover fallback works when download fails.
- [ ] Editing a 1.0.3 note preserves its body and unrelated frontmatter fields.
- [ ] Deleting a record moves the Markdown file to the trash.

## Timeline

- [ ] The timeline opens in a floating modal instead of replacing the library view.
- [ ] The modal closes from the title-bar close button, the Escape key, and the backdrop.
- [ ] The **所有**, **動畫**, **漫畫**, and **小說** buttons show only their matching completion records and update the summary count and date range.
- [ ] A type with no matching records keeps the filter buttons visible so another type can be selected.
- [ ] Completed anime/manga and legacy completed novels appear when they have a completion date.
- [ ] Every saved novel-volume row appears on the timeline because missing completion dates default to today.
- [ ] Every novel-volume card uses the series cover and visibly shows both the work title and `第 N 卷`.
- [ ] Records on the same or nearby dates move into alternating vertical lanes and do not overlap at fit, zoomed-in, or zoomed-out scales.
- [ ] Records completed on the same date are grouped by naturally sorted title, so related numbered works and novel volumes appear in `1`, `2`, `3` order.
- [ ] Dragging pans the timeline.
- [ ] Date-spacing controls change horizontal time distance without resizing cards.
- [ ] Visual-size controls independently shrink and enlarge the complete timeline scene.
- [ ] Fit shows all completion dates at the selected visual size.
- [ ] Selecting a poster opens the media note.

## Mobile

- [ ] Library controls remain usable on iOS or Android.
- [ ] Card, list, and compact views do not overflow horizontally.
- [ ] Add and edit dialogs can be scrolled.
- [ ] Timeline toolbar controls are usable without a mouse.
- [ ] Local covers load after sync.
