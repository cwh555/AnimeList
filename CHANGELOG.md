# Changelog

## 1.4.0 - 2026-08-15

### Added

- Added interface localization for Traditional Chinese, English, Japanese, and Korean, plus **Follow Obsidian**. Settings remain English, while recognized provider tag/category labels are localized for display without rewriting stored values.
- Added opt-in latest-release tracking for manga chapters and already-published novel volumes. Manga tracking combines verified MangaDex evidence with supported official public chapter sources discovered from the exact preserved AniList identity; novel tracking uses NDL/JPRO publication data.
- Added reusable `animelist-images` note sections with file picker, drag/drop, clipboard paste, URL import, lightbox navigation, clipboard copy, Set as cover, multi-select deletion, exact/canonical-raster duplicate protection, and local thumbnail caching.
- Added reusable `animelist-moments` note sections for saving text plus one or more images, with optional source, position, speaker, tags, and note metadata.
- Added a native AnimeList editor submenu for inserting Image Sections and Moments at the current note position without replacing surrounding Markdown.
- Added an **Updates & cleanup** Settings page with review-first duplicate generated-note-cover cleanup alongside explicit legacy metadata upgrade tools.

### Changed

- Reorganized Settings into five top-level pages: General, Search & metadata, Features, Maintenance, and Updates & cleanup. Same-page settings are grouped into clear sections while persisted setting values remain unchanged.
- New built-in media notes no longer add a second standalone body cover below `animelist-detail`; the frontmatter cover remains authoritative and optional note-media sections are independent.
- Image Section reading layout now uses baseline CSS Grid instead of CSS multi-column layout, avoiding an Obsidian 1.4.5 Community compatibility warning while preserving a responsive multi-column grid and uncropped images.
- Moments keeps horizontal image overflow and WebKit/native scrollbar behavior without relying on `scrollbar-width` or `scrollbar-color`, removing the corresponding Community compatibility warning.

### Improved

- Release tracking never treats one manga source as universally newest: valid MangaDex and supported official-source evidence are compared, and the highest valid main chapter is retained.
- Manga supplementary decimal chapters remain distinct from the latest main serialized chapter when the integer base chapter exists; personal reading progress may still contain a decimal value and is never rewritten by release tracking.
- Novel release tracking groups verified main publication lines conservatively and excludes recognized adaptations, spin-offs, short stories, special editions, guides, fanbooks, anthologies, and other side publications from replacing the main latest volume.
- Ambiguous, unmatched, provider-error, and true source-regression states preserve trusted release data and surface review/attention instead of guessing or erasing state.
- Image deletion is reference-aware across series/entry covers, Image Sections, and Moments so a managed image is not trashed while another supported reference still uses it.
- Image Sections and Moments reuse the same managed image import, thumbnail, clipboard, lightbox, and safe-deletion infrastructure instead of maintaining separate storage paths.

### Compatibility and migration

- The media schema remains version 6. Existing 1.3.1 notes remain readable and there is no automatic startup media migration for 1.4.0.
- `animelist-images` and `animelist-moments` are ordinary fenced Markdown blocks; multiple independent blocks may appear in one note and unrelated Markdown/frontmatter is preserved when one block is edited.
- Release tracking fields are additive and never repurpose `progress`, `progress_unit`, `volume_log`, personal status, rating, or note-body content.
- Interface-language changes do not rewrite media titles, raw provider metadata, custom reusable tags, Markdown/frontmatter, note bodies, or templates.
- Older notes with classification metadata gaps can still use explicit **Upgrade legacy metadata**. Older generated notes with an exact redundant standalone cover may use **Remove duplicate note covers** after reviewing the candidate list. Both operations require explicit confirmation and preserve unrelated content.

## 1.3.0 - 2026-08-07

### Added

- Added structured media classification metadata, including format, animation studio or author, anime quarter, filtered AniList media tags, source material, and AniList identity when available.
- Added one Library filter dialog with animation-company, quarter, and reusable-tag groups. Company and tag selections support multi-select matching, quarter is single-select, and the groups combine together.
- Added a persistent reusable tag catalog and an English Settings **Tag manager** with search, creation, rename, global delete, usage counts, and per-work removal.
- Added unified keyboard navigation for manga and novel serial-entry rows: Enter advances through editable fields, Tab follows the same ordered flow, and Backspace can move to the previous field when the current value is empty or fully selected.
- Added a mobile-first phone layout for the Library, Score Dashboard, Add/Edit dialogs, serial-entry editor, and Timeline without introducing a separate mobile data path.

### Changed

- Reorganized Bangumi, AniList, and Open Library behind typed provider clients so initial search and **Load more** share one transport and pagination path while preserving the existing multi-provider search behavior.
- Work-level editable tags remain canonical in `genres`; provider classification tags are stored separately in `media_tags` and do not replace user-edited tags.
- Large Library views now use a scoped `MediaLibraryIndex`, progressive card rendering, on-demand thumbnail generation, and path-scoped refresh handling instead of rebuilding the complete UI for unrelated vault changes.
- Score Dashboard and Markdown AnimeList views now ignore unrelated vault changes, and Score Dashboard no longer schedules thumbnail generation for every poster simply because the dashboard is opened.

### Improved

- Improved animation-studio selection by using AniList's structured animation-studio flag and Bangumi's structured animation-production person relations instead of treating generic production-company text as an animation studio.
- Canonicalized animation-studio identity so formatting-only variants such as spacing or punctuation differences collapse to one readable Library filter option.
- Improved existing-library startup safety so tag catalog initialization does not initialize an empty Library cache before Obsidian metadata is ready, and stale saved filter values are discarded when their options no longer exist.
- Improved phone usability with touch-sized controls, horizontally swipeable filter/status/score lanes, near-full-screen editors, and full-screen Timeline chrome.

### Compatibility and migration

- Stable 1.2.1 Markdown notes remain readable without an automatic startup migration, and the current media schema remains version 6.
- Existing notes may not contain the new `studios`, `season`, or `season_year` metadata. Run **Settings → Legacy metadata cleanup → Scan and upgrade** to backfill supported classification data before relying on company or quarter filters for an older library.
- Legacy `user_tags` and supported `classification_*` fields are read compatibly and can be consolidated into canonical fields by the explicit cleanup flow. Unrelated frontmatter, Obsidian `tags`, source identity, personal progress/rating data, and Markdown body content are preserved.
- The cleanup is explicit and rate-limited; an unavailable AniList match leaves the note eligible for a later retry, while structured provider studio data can still be retained when available.

## 1.2.1 - 2026-07-27

### Fixed

- Aligned manga and novel serial-entry start and completion date fields with the shared segmented date input and full-width editor layout.
- Prevented adding a chapter, season, or volume entry from jumping the modal or page before focusing the new unit field.
- Preserved the correct modal receiver when temporarily intercepting serial-cover modal opening, eliminating the unbound-method warning.
- Made list-mode covers and placeholders fill the complete row height while keeping cover metadata on one line.

### Compatibility

- No Markdown, frontmatter, progress-unit, serial-cover, or media-status schema changes are introduced in this patch release.

## 1.2.0 - 2026-07-26

### Added

- Added a Score Dashboard with 0.5-point lanes, media-type filters, zoom, drag-and-drop rating changes, and batch editing.
- Added an optional Masterpiece mode with reusable categories, multiple categories per title, grouped library sections, and backward-compatible Favorite data.
- Added chapter, season, and volume progress units for manga and novels, with unit-aware dated entries.
- Added optional covers for individual manga and novel dated entries, with conservative automatic loading, broad manual search, and migration for existing records.
- Added configurable Chinese, English, and original-language search expansion.
- Added conservative duplicate-title warnings with direct navigation to an existing note.

### Changed

- Standardized ratings to 0.5-point increments from 0 to 10. Existing non-conforming values remain unchanged until the note is saved, then round to the nearest 0.5 with a warning.
- Simplified personal media statuses to Ongoing, Completed, Wishlist, and Dropped while keeping legacy status values readable.
- Replaced misleading percentage-style progress for manga and novels with a shared state-based presentation.
- Standardized interface descriptions, status names, actions, and sorting terminology.

### Improved

- Improved multilingual title discovery, season and edition ranking, provider result pagination, cover caching, and library navigation.
- Improved timeline default spacing, same-day stacking, independent date spacing and view scaling, and fit/reset controls.
- Improved progress controls and dated serial-entry editing across manga and novels.
- Improved serial-entry cover handling with insertion-ordered automatic lookups, direct candidate-card selection, broad manual discovery, and per-entry timeline covers with series-cover fallback.

### Compatibility

- Existing Favorite data, legacy statuses, `volume_log` entries, unrelated frontmatter, and Markdown note content remain supported.
- Existing dated entries without cover metadata remain valid; editing dates, labels, or covers preserves unrelated entry fields.
- Anime remains restricted to episode progress, while manga and novels may use chapter, season, or volume units.

## 1.1.2 - 2026-07-22

- Retries localized season and subtitle searches with broader series queries, then ranks explicit season matches from provider aliases.
- Uses the outer Obsidian modal as the only vertical scroll container so wheel scrolling does not become trapped in search results.
- Naturally orders same-day timeline entries by related title and volume number.
- Separates timeline date-spacing controls from an independent visual-size scale.
- Keeps compact rows at cover height, truncates overflowing text, and starts compact cover loading immediately.
- Uses consistent year, month, and day date segments that advance after four, two, and two digits.

## 1.1.1 - 2026-07-21

- Reorganizes the README around installation, everyday use, the Markdown data model, and concise development links.
- Presents the released 1.1.0 feature summary in a GitHub callout instead of marking it unreleased.

## 1.1.0 - 2026-07-21

- Separates personal reading status from Japanese publication status for manga and novels without relying on unreliable latest chapter or volume totals.
- Supports novel volume labels such as `7.5` and `EX`; newly added volumes default to completed today while the dates remain editable.
- Expands novel volumes into timeline entries with a visible volume label, the normal series cover, and collision-aware vertical lanes.
- Adds timeline filters for all records, anime, manga, and novels.
- Sorts volume rows and saved history by normalized volume number, and automatically scrolls and focuses newly added or repositioned rows.
- Requires a personal score and completion date only for completed works.
- Writes the 1.1.0 serial-reading model as schema 5 while keeping published 1.0.3 notes readable.

## 1.0.3 - 2026-07-20

- Publish the Community-review-compliant build as a new release.

## 1.0.2 - 2026-07-19

- Replaces direct `innerHTML` writes with Obsidian icons and explicit DOM construction.
- Preserves custom view placement when the plugin unloads.
- Uses native Obsidian setting headings.
- Adds GitHub build provenance attestations for release assets.
- Removes the redundant plugin-name settings heading and adds a release preflight for Community review blockers.
- Replaces forbidden lint suppressions with Obsidian DOM helpers, declarative settings, typed API boundaries, scoped vault traversal, and CSS specificity.
- Runs the official `eslint-plugin-obsidianmd` recommended rules in `npm run check` with zero warnings.

## 1.0.1 - 2026-07-19

- Simplifies the built-in media note body to the title, AnimeList detail block, cover, and creation timestamp.
- Keeps custom templates supported while exposing only one built-in minimal template.
- Stops appending the external summary and source link to the note body; both remain available in frontmatter.

## 1.0.0 - 2026-07-19

- Initial public release of AnimeList as an Obsidian community plugin repository.
- Preserves the tested v6.2 Markdown library, search, editing, filtering, view, and timeline behavior.
- Uses a native Obsidian custom view while retaining Markdown code-block compatibility.
- Replaces Vitest/Vite with Node.js built-in tests to keep installation small and predictable.
- Makes the npm lockfile registry-neutral.
- Uses a local compile-time Obsidian API type shim so `npm ci` does not download the large Obsidian/CodeMirror/Moment development dependency chain.
- Explicitly stops the esbuild test service so `npm test` exits after the test summary.
