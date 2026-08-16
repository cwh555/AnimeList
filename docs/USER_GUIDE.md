# AnimeList User Guide

AnimeList stores anime, manga, and novel records as ordinary Markdown notes with YAML frontmatter. This guide covers the main workflows without replacing the Markdown files as the source of truth.

## Getting started

Open AnimeList from the ribbon or run **AnimeList: Open library** from the command palette. Select **收錄**, choose a media type, search for a title, review the imported metadata, and save it.

AnimeList supports a managed library with separate Anime, Manga, Novel, Covers, and Templates folders, or a flat-folder layout. Additional scan folders can include existing notes without moving them.

The AnimeList interface can use Traditional Chinese, English, Japanese, or Korean, or follow Obsidian's interface language. The Settings page intentionally remains English.

## Library and media statuses

The library uses four personal statuses:

- **Ongoing** for titles currently being watched or read.
- **Completed** for finished titles.
- **Wishlist** for planned titles, including older On Hold or Paused records.
- **Dropped** for titles no longer being continued.

Legacy status values remain readable. Watching, Reading, and Active map to Ongoing; Wishlist, On Hold, and Paused map to Wishlist.

Use the library controls to search, filter by media type or status, open the dedicated Filter dialog, change sorting, and switch between card, list, and poster views. The Filter dialog groups animation companies, anime quarters, and reusable work tags. Company and tag groups support multiple selections; quarter is single-select; all active groups apply together.

## Progress, ratings, and dated entries

Anime progress uses episodes. Manga and novels can use chapters, seasons, or volumes.

- Chapter and season labels use non-negative whole numbers.
- Volume labels support whole numbers, `.5`, and `EX`.
- Manga and novels can keep dated entries for each chapter, season, or volume.
- Completed titles require a personal rating and completion date.
- Other statuses may leave the rating and completion date empty.

Ratings use a 0–10 range in 0.5-point increments. Existing values such as `7.3` are not changed during upgrade. Saving that note rounds the value to the nearest 0.5 and shows a warning.

For manga and novel dated rows, Tab follows one ordered workflow through the entry label, start date, completion date, Remove, the next row, Add entry, and Save. Plain Enter advances through text/date inputs; Enter on buttons keeps the button action. When the current input is empty, fully selected, or reduced from one character to empty, Backspace can move to the previous ordered field.

Anime shows numeric progress when a usable total is known. Manga and novel progress uses a state-based track: completed titles are full, ongoing or dropped titles with recorded progress are partial, and Wishlist or zero-progress titles are empty.

### Serial-entry covers

Each dated manga or novel entry can store its own optional cover. The normal series cover remains unchanged and is used whenever an entry has no usable cover.

Automatic cover loading is intentionally conservative: AnimeList applies a result only when the title, media type, and entry label form an unambiguous match. Rapidly added entries are processed in insertion order, so a slower request cannot cause an intermediate chapter, season, or volume to be skipped. A failed lookup does not block later queued entries.

Click an entry's cover area or retry action to open manual cover search. Manual search is broader than automatic loading: it searches the edited query and the stored original-language title, keeps lower-confidence candidates visible, and ranks likely title and entry-number matches first. Click anywhere on a candidate card to download and apply that cover immediately; there is no separate Select or Apply step. If the download fails, the search window stays open so another result can be chosen.

Clear an entry cover to return that entry to the series-cover fallback. Existing notes can use **Settings → Maintenance → Serial cover recovery** to scan dated entries in a floating progress window. The migration reports loaded, not found, failed, and skipped records, supports cancellation, and never overwrites an existing entry cover.

## Search and duplicate warnings

AnimeList searches enabled providers:

- Bangumi and AniList for anime, manga, and light novels.
- Open Library for general novels and books.

Search settings can expand queries with Chinese, English, and original-language titles. Chinese discovery includes Traditional and Simplified aliases; original-language discovery may include native and romanized titles.

Results are ranked with title relevance and season, part, movie, special, or edition information. Use **Load more** when a provider has additional results.

Duplicate warnings are intentionally conservative. A warning appears only when stored identity data strongly indicates the same title, rather than merely a related season, adaptation, movie, special, or spin-off. The warning can open the existing note directly.

## Metadata, filters, and tags

When a supported result is selected, AnimeList can enrich the note with classification metadata without replacing the original provider identity. Anime records can show format, animation-production studio, and quarter; manga and novels show format and author information when available. AniList classification can also provide filtered media tags and source material.

The Library Filter dialog contains three independent groups:

- **Company** — animation studios for anime. Multiple selections require the work to match every selected studio identity. Formatting-only name variants are collapsed into one option.
- **Quarter** — one anime quarter at a time, displayed from the stored season and year.
- **Tags** — reusable work tags. Multiple selections require the work to contain every selected tag.

Company/quarter filters apply only to anime. All active groups combine, so a work must satisfy the media/status/search controls and every selected filter group. Saved filters that no longer correspond to any current option are cleared automatically instead of hiding the whole library.

Editable work tags are stored in `genres`. Provider classification tags are stored separately in `media_tags`; they do not overwrite the tags you selected for the work. Recognized provider-supplied tag/category labels are localized for display using the selected AnimeList interface language; unknown/custom tag text is left unchanged, and the stored canonical metadata is not rewritten when you switch languages. Adding a tag from an Add/Edit dialog also adds it to the reusable catalog. Removing it from one work removes only that membership.

Open **Settings → Features → Tags → Manage tags…** to manage the reusable catalog. The Tag manager uses the selected AnimeList interface language and a searchable vertical list. Open a tag to rename it, delete it globally, inspect every work using it, or use the `×` beside one work to remove only that work's membership. Renaming into an existing tag merges memberships without creating duplicates.

### Animation-studio metadata

AnimeList treats the Company filter as **animation production**, not generic producers, committees, financing entities, or broad production-company text. AniList studio data is accepted only from structured animation-studio records. When a Bangumi subject does not expose a usable animation studio in its summary metadata, AnimeList can fall back to Bangumi's structured subject-person relation for animation production.

Studio identity normalization is formatting-based rather than a per-company alias list. Spacing and punctuation variants can collapse to one filter option, while role-labelled or malformed composite metadata is rejected instead of becoming a company name.

## Latest release tracking

Release tracking is optional and is deliberately separate from personal reading progress. Enable it under **Settings → Features → Latest release tracking**.

When enabled, AnimeList can store and display provider-backed latest-release information for manga and novels:

- **Manga** — a safely matched title can use MangaDex chapter metadata. If the note also preserves an AniList identity, AnimeList may discover supported official public chapter pages from that exact AniList work and compare their valid evidence with MangaDex.
- **Novels** — AnimeList uses public NDL/JPRO bibliographic data to identify the already-published main volume line.
- **Anime** — release tracking does not apply.

The Library exposes a release-check action and a dashboard. Per-title refresh and Refresh All explicitly contact providers. An optional automatic check can run periodically; it records its own last-check state and does not change reading progress.

### What the tracker may write

Release state is additive. Depending on media type and provider state, a note may gain fields such as:

```yaml
release_tracking_status: verified
release_tracking_provider: mangadex
release_tracking_ref: example-id
release_tracking_source_label: MangaDex
release_tracking_checked_at: 2026-08-15T12:00:00.000Z
latest_chapter: "111"
latest_release_date: 2026-08-06
```

Novel tracking similarly uses `latest_volume` and may persist verified catalog/title/creator/publisher/imprint information used to keep the publication line stable.

Release tracking **never rewrites** `progress`, `progress_unit`, `volume_log`, personal status, score, or note-body text. A user may therefore have reading progress such as `281.1` while the provider-backed latest main serialized chapter is `281`.

### Conservative matching and regressions

AnimeList does not assume that one manga source is always newest. It compares valid evidence and retains the highest valid main chapter. Decimal supplementary chapters do not replace an integer main chapter when the integer base exists, but genuinely decimal-only numbering remains supported.

For novels, the tracker excludes recognized spin-offs, side stories, short-story collections, SS/SSS, Ex, Alter, gaiden/extra publications, fanbooks, guides, anthologies, and other derived lines from silently replacing the main numbered publication line.

If a result is ambiguous, unmatched, unavailable, or lower than trusted stored data, AnimeList surfaces an attention state instead of overwriting trusted information. Use the review/manager UI to resolve a binding or disable tracking for that title.

## Image Sections

Image Sections let a media note keep reusable groups of related images as ordinary Markdown.

Insert one from the note editor's native context menu:

**AnimeList → Add image section**

The inserted block is simple and portable:

````markdown
```animelist-images
- AnimeList/Images/anime/example/scene-1.jpg
- AnimeList/Images/anime/example/scene-2.jpg
```
````

Multiple independent `animelist-images` blocks may appear anywhere in one note. Editing one section preserves the others, unrelated Markdown, and frontmatter.

### Adding and viewing images

An Image Section accepts:

- file picker selection;
- drag and drop;
- clipboard paste;
- an explicit image URL.

Reading view shows a responsive image grid with bounded scrolling and **Show all / Show less** when needed. Images keep their full aspect ratio rather than being cropped. Clicking an image opens the original in a lightbox; keyboard arrows navigate only within that Image Section and Escape closes the lightbox.

Image actions include:

- **Copy image** — copies the original image to the system clipboard;
- **Set as cover** — applies the selected image as the media cover;
- **Delete** — removes that reference and safely trashes a managed image only when nothing else still uses it;
- Shift-click / selection mode — removes multiple selected images together.

Gallery rendering uses locally generated thumbnails when available, but lightbox and clipboard operations use the original Vault image.

### Duplicate behavior

Within one Image Section, AnimeList rejects exact duplicate image content even when the filename changed. Supported raster formats also use a canonical exact raster fingerprint so a clipboard re-encode of the same pixels does not create another copy in the same section. This is exact duplicate protection, not fuzzy visual similarity: similar screenshots remain separate images.

The same image may intentionally appear in a different Image Section or Moment. Managed-image deletion is reference-aware across supported covers, Image Sections, and Moments.

## Moments

Moments are for scene memories that need **text plus one or more related images**, rather than an image-only gallery. Insert a section from:

**AnimeList → Add moments section**

An empty section is stored as:

````markdown
```animelist-moments
moments: []
```
````

Each Moment requires text and at least one image. Optional metadata includes:

- `source` — episode, chapter, volume, or other source label;
- `position` — timestamp, scene position, or contextual location;
- `speaker` — character or speaker;
- `tags` — Moment-specific labels;
- `note` — longer personal context.

A serialized Moment remains readable YAML inside the fenced block:

```yaml
moments:
  - id: "m_example"
    text: |-
      A line worth remembering.
    source: "Episode 1"
    speaker: "Example character"
    tags:
      - "quote"
    note: |-
      Personal context stays in the vault.
    images:
      - "AnimeList/Images/anime/example/scene-1.jpg"
```

Moment IDs are stable across edits. Empty optional metadata is omitted instead of writing placeholder values.

### Reading and editing Moments

A desktop Moment places media first, then quote/metadata content. One image uses a large uncropped featured stage; multiple images remain one horizontal row and scroll instead of wrapping or cropping. Long text can expand/collapse explicitly. Narrow layouts keep media first and rearrange quote/metadata vertically without page-level horizontal overflow.

Moment images can be added by file, drag/drop, clipboard paste, or URL. Reading view supports scoped lightbox navigation and copy actions. Deleting a Moment does not trash a managed image while another cover, Image Section, or Moment still references it.

See [`MOMENTS_TEST_VAULT.md`](MOMENTS_TEST_VAULT.md) for the dedicated real-scene Test Vault regression cases.

## Favorites and Masterpiece categories

The special-label setting offers two modes:

- **Favorite** keeps the simple star behavior.
- **Masterpiece** lets the star assign one or more reusable categories.

In Masterpiece mode, open the category selector from a title's star or edit action. Select existing categories or create a new one. A title can belong to multiple categories and appears in each matching section of the Masterpiece library view.

Unchecking every category and saving removes the title from Masterpiece. Existing `favorite: true` notes remain compatible and appear in the default `masterpiece` section when no category is stored. Switching modes does not discard stored categories.

## Score Dashboard

Open the Score Dashboard from the library action beside Timeline. It groups each media note once across scores from 10.0 to 0.0 and keeps unrated titles separate from the valid 0.0 lane.

The dashboard supports:

- All, Anime, Manga, and Novel filters.
- Showing or hiding unrated titles.
- Pinch or Ctrl+wheel zoom while normal wheel scrolling remains available.
- Dragging one cover to another score lane or to Unrated.
- Batch selection, direct score assignment, and ±0.5 adjustments.
- Shift-click to enter batch mode and select a poster immediately.
- Dragging any selected poster to move the full selection.

A batch containing unrated titles cannot use ±0.5 adjustment until those titles receive a score. Changes that would exceed 0–10 require confirmation and are clamped to the valid range.

## Timeline

The timeline shows completion records and dated serial entries. Use the media-type filters to show all records, anime, manga, or novels.

Date spacing and visual scale are independent controls. **Fit** displays the complete timeline, while **Reset** restores the calculated default view. The default spacing considers the date range, record density, and unavoidable same-day stacks.

Completed chapter, season, or volume entries appear as separate dated events. Each event prefers its own entry cover and falls back to the normal series cover when no entry cover is available. Select a card to open its Markdown note.

## Markdown data and templates

A discoverable note includes a supported `media_type`:

```yaml
---
title: Example work
media_type: manga
status: ongoing
progress: 12
progress_unit: chapter
score:
---
```

Common values include:

- `media_type`: `anime`, `manga`, or `novel`
- `status`: `ongoing`, `completed`, `planned`, or `dropped`
- `progress_unit`: `episode`, `chapter`, `season`, or `volume`
- `genres`: editable/reusable work tags
- `media_tags`: filtered provider classification tags, kept separate from editable work tags
- `studios`: animation-production studios for anime
- `season` and `season_year`: anime quarter metadata used by the Library quarter filter
- `source_material`: optional classification source material
- `anilist_id`: preserved AniList identity when a reliable match is available
- `favorite`: whether the special label is active
- `masterpiece_labels`: reusable Masterpiece categories
- `volume_log`: the backward-compatible container for dated serial entries
- `release_tracking_*`, `latest_chapter`, `latest_volume`, `latest_release_date`: optional release-tracking state

A `volume_log` entry may contain `label`, `started_at`, `completed_at`, and optional cover metadata such as `cover`, `cover_provider`, `cover_source_id`, and `cover_manual`. Entries without cover fields remain valid.

Image Sections and Moments live in fenced Markdown blocks in the note body rather than changing the media schema. AnimeList preserves unrelated frontmatter, unknown dated-entry fields, unrelated Markdown blocks, and ordinary note content when editing supported fields.

The built-in template is intentionally minimal. Custom templates can be placed in the configured `Anime`, `Manga`, `Novel`, or `Common` template folders. Supported variables include:

```text
{{title}}
{{date}}
{{time}}
{{original_title}}
{{media_type}}
{{cover}}
{{summary}}
{{source_url}}
```

## Settings

Settings are organized into five top-level pages:

1. **General** — interface, library/storage, file locations, and Timeline defaults.
2. **Search & metadata** — search-language expansion and metadata providers.
3. **Features** — optional feature settings such as Latest release tracking, serial-cover lookup, reusable tags, and Favorite/Masterpiece behavior.
4. **Maintenance** — recurring repair/setup operations such as serial-cover recovery and library setup.
5. **Updates & cleanup** — explicit version/update cleanup operations that may rewrite recognized AnimeList content after review.

The selected Settings page is UI state only; changing tabs does not change persisted user configuration.

### Interface language

**Interface language** supports:

- Follow Obsidian
- Traditional Chinese
- English
- Japanese
- Korean

The Settings page always stays in English. Interface language is independent from Search languages. Recognized provider-supplied tag/category labels follow the selected interface language, while media titles, raw provider metadata, custom reusable tags, Markdown/frontmatter, Moment text, note bodies, and existing templates are not rewritten. Older settings without an interface-language value continue to use the compatibility default.

## Updates & cleanup

Cleanup actions are deliberately explicit and review-first. Back up or fully sync the vault before confirming a rewrite.

### Remove duplicate note covers

Older generated notes may contain the same cover twice: once in `cover` frontmatter / AnimeList detail rendering and once as an old generated `![[cover-path|260]]` line directly after `animelist-detail`.

**Remove duplicate note covers** scans only for the exact old generated pattern where the body image path exactly matches the current `cover` frontmatter. It skips ambiguous/custom-template cases, shows the candidate list before mutation, and revalidates each note when Confirm is pressed. Unrelated images, frontmatter, and body prose are preserved.

New built-in notes do not add this duplicate standalone cover line.

### Upgrade legacy metadata

Older notes may lack the structured company/quarter metadata used by current filters or may contain recognized preview-era `user_tags`, `classification_*`, mixed tag/studio values, or malformed company data.

Use **Upgrade legacy metadata** to scan and review those records. The cleanup rewrites only recognized AnimeList metadata, preserves unrelated frontmatter and Markdown body content, and leaves an unavailable/unreliable provider match eligible for a later retry instead of guessing.

There is no automatic startup rewrite for either cleanup path.

## Network access and privacy

AnimeList is local-first, but enabled features may make network requests:

- media search/enrichment to enabled metadata providers;
- cover lookup/download where requested;
- opt-in release tracking to MangaDex, supported official public chapter sources, and NDL/JPRO data;
- a user-supplied image URL when explicitly importing it into an Image Section or Moment.

Personal ratings, watch/read progress, completion dates, reusable tags, Moment text, general note-body content, and locally stored images are not sent as telemetry. Release tracking does not upload or overwrite personal reading progress. AnimeList does not maintain a private remote copy of the library and does not include telemetry.
