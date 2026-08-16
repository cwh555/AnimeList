# AnimeList version sessions

This document preserves the product-level decisions introduced by each major development version. It intentionally records features and data-model changes rather than individual bug fixes or implementation detours.

## 1.0.x — Public foundation

**Release state:** Published through `1.0.3`.

### Main outcomes

- Established Markdown files and local images as the source of truth.
- Added the native AnimeList library view while keeping Markdown code-block compatibility.
- Added anime, manga, and novel metadata search, local cover downloads, editing, filtering, favorites, and multiple library layouts.
- Added the completion timeline and built-in minimal note template.
- Completed the Obsidian Community-plugin review and release workflow.

### Stable contract carried forward

- Existing notes remain usable without the plugin.
- The library scans configured folders rather than maintaining a separate database.
- Series-level cover images remain the artwork used by library cards.

## 1.1.0 — Serial reading and novel-volume timeline

**Release state:** Published through `1.1.2`.

### Main outcomes

- Separated personal reading status from Japanese publication status for manga and novels.
- Removed unreliable latest chapter and latest volume totals from manga and novel workflows; completion is selected explicitly.
- Made personal score and completion date required only for completed works.
- Added novel volume labels for integers, half volumes, and `EX`; new rows default to completed today, with editable start and completion dates.
- Expanded each volume into a timeline entry with a visible volume label, the normal series cover, and vertical collision lanes.
- Added timeline filters for all records, anime, manga, and novels without changing the stored media data.
- Ordered volume rows and serialized history by normalized volume label, while automatically moving the editor viewport and keyboard focus to a newly added or repositioned row.
- Centralized approved user-facing action labels in tracked source so the same operation uses the same wording across views.

### Data model

- Uses `schema_version: 5` for newly saved records.
- Stores volume history in `volume_log`.
- Keeps the series cover in the top-level `cover` property.
- Stores `label`, optional `started_at`, and `completed_at` inside each `volume_log` entry.

## 1.2.0 — Dashboards, flexible reading progress, and serial-entry covers

**Release state:** Published through `1.2.1`.

### Main outcomes

- Added the Score Dashboard with 0.5-point lanes, direct drag-and-drop rating changes, filtering, zoom, and batch operations.
- Added optional Masterpiece categories while preserving existing Favorite data.
- Added chapter, season, and volume progress units for manga and novels.
- Added optional covers for dated manga/novel entries with conservative automatic loading, broad manual search, migration, and Timeline fallback.
- Improved multilingual search, duplicate warnings, Timeline controls, progress editing, and responsive serial-entry behavior.

### Data model

- Uses `schema_version: 6` for newly saved records.
- Keeps dated serial-entry metadata in `volume_log` and adds optional per-entry cover fields without invalidating older entries.
- Existing legacy status and Favorite data remain readable.

## 1.3.0 — Classification, reusable tags, filtering, and mobile performance

**Release state:** Published through `1.3.1`.

### Main outcomes

- Added format, animation-studio/author, anime-quarter, provider media-tag, source-material, and AniList classification metadata when a reliable match is available.
- Added combined Library filtering by animation company, quarter, and reusable work tags.
- Added a persistent reusable Tag Manager with search, add, rename, global delete, usage inspection, and per-work removal.
- Added structured animation-studio resolution and generic studio identity normalization so producer/committee metadata and formatting-only duplicates do not pollute the Company filter.
- Added explicit Legacy metadata cleanup for backfilling current classification metadata and consolidating recognized preview-era fields.
- Added a cached Library index, scoped refreshes, progressive rendering, demand-loaded thumbnails, and lazy Score Dashboard cover behavior for large libraries.
- Added mobile-first phone layouts across the Library, Score Dashboard, media editor, serial-entry editor, Tag Manager, Filter dialog, and Timeline.
- Added unified serial-entry keyboard navigation and reorganized external metadata providers behind typed clients without changing the public multi-provider search contract.

### Data model

- Keeps `schema_version: 6`; 1.3 metadata fields are additive and optional.
- `genres` remains the canonical editable/reusable work-tag field.
- `media_tags` stores filtered provider classification tags separately from user-edited tags.
- Anime classification may add `studios`, `season`, `season_year`, `source_material`, and `anilist_id`.
- Older notes remain readable without startup rewriting; explicit cleanup can backfill missing metadata and consolidate supported `user_tags` / `classification_*` fields while preserving unrelated frontmatter and body content.

## 1.4.0 — Localized UI, release awareness, and reusable note media

**Release state:** Published.

### Main outcomes

- Added a localized AnimeList interface for Traditional Chinese, English, Japanese, and Korean, plus Follow Obsidian. Settings remain English, and provider taxonomy localization is display-only.
- Added opt-in latest-release tracking for manga chapters and already-published novel volumes without changing personal reading progress.
- Manga tracking combines verified MangaDex evidence with supported official public chapter pages discovered from the exact preserved AniList identity; the highest valid main-chapter evidence wins rather than assuming one source is always newest.
- Novel tracking uses NDL/JPRO publication records with main-line matching that excludes recognized adaptations, side stories, specials, guides, and other parallel publications.
- Added reusable `animelist-images` sections anywhere in a note with local image management, clipboard/file/drag-drop/URL import, duplicate protection, thumbnails, lightbox navigation, copy, Set as cover, and reference-aware deletion.
- Added reusable `animelist-moments` sections for quote/scene memories composed of text plus one or more images and optional source, position, speaker, tags, and note fields.
- Added the native AnimeList editor submenu for inserting Image Sections and Moments without replacing surrounding Markdown.
- Reorganized Settings into General, Search & metadata, Features, Maintenance, and Updates & cleanup pages with clear section grouping.
- Added review-first duplicate generated-note-cover cleanup alongside the existing explicit legacy metadata cleanup.
- Kept note-media layouts compatible with the declared Obsidian browser baseline by avoiding CSS multi-column and non-baseline scrollbar properties.

### Data model

- Keeps `schema_version: 6`; no startup media-schema migration is introduced.
- `animelist-images` and `animelist-moments` are ordinary fenced Markdown blocks and do not require a new frontmatter schema version.
- Moments use stable IDs; optional Moment metadata is omitted when empty.
- Release tracking adds `release_tracking_*`, `latest_chapter` / `latest_volume`, `latest_release_date`, and source/check metadata only when the feature is configured or refreshed.
- Release tracking never repurposes or overwrites `progress`, `progress_unit`, `volume_log`, personal status, rating, or note body text.
- Interface-language changes do not rewrite titles, raw provider metadata, custom tags, Markdown/frontmatter, note bodies, or templates.
- Managed image deletion remains reference-aware across covers, Image Sections, and Moments.
- Version cleanup actions are explicit, review-first, and revalidate each candidate before mutation.

## Future session template

```markdown
## X.Y.0 — Feature theme

**Release state:** Planning / Preview / Published.

### Main outcomes

- Feature-level change.

### Data model

- Persistent schema or compatibility decision, when applicable.
```
