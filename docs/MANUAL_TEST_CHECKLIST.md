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
- [ ] The active view remains selected after editing or toggling a favorite.
- [ ] Search, media type, status, and genre filters can be combined.
- [ ] Default sorting is newest completion date first.
- [ ] Recently updated sorting uses the file modification time.

## Create and edit

- [ ] Search works with Bangumi enabled alone.
- [ ] Search works with AniList enabled alone.
- [ ] General novel search works with Open Library enabled.
- [ ] Title, score, and completion date are required.
- [ ] Completion date defaults to today.
- [ ] Completed status synchronizes progress to the total.
- [ ] Local cover download succeeds.
- [ ] Remote cover fallback works when download fails.
- [ ] Built-in templates work without copying files into the vault.
- [ ] Custom templates appear from Anime, Manga, Novel, and Common folders.
- [ ] Deleting a record moves the Markdown file to the trash.

## Timeline

- [ ] The timeline opens in a floating modal instead of replacing the library view.
- [ ] The modal closes from the title-bar close button, the Escape key, and the backdrop.
- [ ] Only completed records with a completion date appear.
- [ ] Multiple records completed on one day do not overlap.
- [ ] Dragging pans the timeline.
- [ ] Zoom changes day spacing, not poster dimensions.
- [ ] Fit shows all completion dates.
- [ ] Selecting a poster opens the media note.

## Mobile

- [ ] Library controls remain usable on iOS or Android.
- [ ] Card, list, and compact views do not overflow horizontally.
- [ ] Add and edit dialogs can be scrolled.
- [ ] Timeline toolbar controls are usable without a mouse.
- [ ] Local covers load after sync.
