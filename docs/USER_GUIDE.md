# AnimeList User Guide

AnimeList stores anime, manga, and novel records as ordinary Markdown notes with YAML frontmatter. This guide covers the main workflows without replacing the Markdown files as the source of truth.

## Getting started

Open AnimeList from the ribbon or run **AnimeList: Open library** from the command palette. Select **收錄**, choose a media type, search for a title, review the imported metadata, and save it.

AnimeList supports a managed library with separate Anime, Manga, Novel, Covers, and Templates folders, or a flat-folder layout. Additional scan folders can include existing notes without moving them.

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

Clear an entry cover to return that entry to the series-cover fallback. Existing notes can use **Settings → Load missing covers** to scan dated entries in a floating progress window. The migration reports loaded, not found, failed, and skipped records, supports cancellation, and never overwrites an existing entry cover.

## Search and duplicate warnings

AnimeList searches enabled providers:

- Bangumi and AniList for anime, manga, and light novels.
- Open Library for general novels and books.

Search settings can expand queries with Chinese, English, and original-language titles. Chinese discovery includes Traditional and Simplified aliases; original-language discovery may include native and romanized titles.

Results are ranked with title relevance and season, part, movie, special, or edition information. Use **Load more** when a provider has additional results.

Duplicate warnings are intentionally conservative. A warning appears only when stored identity data strongly indicates the same title, rather than merely a related season, adaptation, movie, special, or spin-off. The warning can open the existing note directly.

## Metadata, filters, and tags

When a supported result is selected, AnimeList can enrich the note with classification metadata without replacing the original provider identity. Anime records can show format, animation-production studio, and quarter; manga and novels show format and author information when available. AniList classification can also provide filtered media tags and source material.

The Library **篩選** dialog contains three independent groups:

- **公司** — animation studios for anime. Multiple selections require the work to match every selected studio identity. Formatting-only name variants are collapsed into one option.
- **季度** — one anime quarter at a time, displayed from the stored season and year.
- **標籤** — reusable work tags. Multiple selections require the work to contain every selected tag.

Company/quarter filters apply only to anime. All active groups combine, so a work must satisfy the media/status/search controls and every selected filter group. Saved filters that no longer correspond to any current option are cleared automatically instead of hiding the whole library.

Editable work tags are stored in `genres`. Provider classification tags are stored separately in `media_tags`; they do not overwrite the tags you selected for the work. Adding a tag from an Add/Edit dialog also adds it to the reusable catalog. Removing it from one work removes only that membership.

Open **Settings → Tags → Manage tags…** to manage the reusable catalog. The Tag manager is intentionally English and uses a searchable vertical list instead of displaying every tag directly in Settings. Open a tag to rename it, delete it globally, inspect every work using it, or use the `×` beside one work to remove only that work's membership. Renaming into an existing tag merges memberships without creating duplicates.

### Animation-studio metadata

AnimeList treats the Company filter as **animation production**, not generic producers, committees, or financing/production entities. AniList studio data is accepted only from structured animation-studio records. When a Bangumi subject does not expose a usable animation studio in its summary metadata, AnimeList can fall back to Bangumi's structured subject-person relation for animation production.

Studio identity normalization is formatting-based rather than a per-company alias list. Spacing and punctuation variants can collapse to one filter option, while role-labelled or malformed composite metadata is rejected instead of becoming a company name.

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
- `genres`: editable/reusable work tags; this is the canonical field used by the 1.3 Tag manager and Library tag filter
- `media_tags`: filtered provider classification tags, kept separate from editable work tags
- `studios`: animation-production studios for anime
- `season` and `season_year`: anime quarter metadata used by the Library quarter filter
- `source_material`: optional classification source material
- `anilist_id`: preserved AniList identity when a reliable match is available
- `favorite`: whether the special label is active
- `masterpiece_labels`: reusable Masterpiece categories
- `volume_log`: the backward-compatible container for dated serial entries

A `volume_log` entry may contain `label`, `started_at`, `completed_at`, and optional cover metadata such as `cover`, `cover_provider`, `cover_source_id`, and `cover_manual`. Entries without cover fields remain valid.

AnimeList preserves unrelated frontmatter, unknown dated-entry fields, and Markdown body content when editing supported fields.

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

## Settings and privacy

Settings control storage folders, templates, cover storage, timeline defaults, metadata providers, search-language expansion, Favorite or Masterpiece mode, reusable tags, migration of missing serial-entry covers, and explicit legacy metadata cleanup.

> [!DANGER]
> **Legacy metadata cleanup changes recognized AnimeList frontmatter.**
>
> Stable 1.2.1 notes stay readable without an automatic migration. However, older notes may not yet contain the company/quarter fields used by the new 1.3 filters, and preview/development builds may have written legacy `user_tags`, `classification_*`, mixed tag/studio values, or malformed company data. Before cleanup, make sure the vault is backed up or fully synced. Then use **Settings → Legacy metadata cleanup → Scan and upgrade**. The cleanup preserves unrelated frontmatter and Markdown body content while consolidating recognized legacy fields and refreshing classification metadata when a reliable provider match is available.

The cleanup is explicit rather than automatic. A note without a reliable AniList match remains eligible for a future retry. Existing valid studio metadata is not replaced by the Bangumi fallback path, while missing studio metadata can be recovered from a structured animation-production relation when available.

Only search/enrichment queries are sent to enabled metadata providers. Ratings, progress, dates, reusable tags, note bodies, and locally stored covers remain in the vault.
