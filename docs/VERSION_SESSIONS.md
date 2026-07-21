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

**Release state:** Preview; not tagged or published.

### Main outcomes

- Separated personal reading status from Japanese publication status for manga and novels.
- Removed unreliable latest chapter and latest volume totals from manga and novel workflows; completion is selected explicitly.
- Made personal score and completion date required only for completed works.
- Added novel volume labels for integers, half volumes, and `EX`; new rows default to completed today, with editable start and completion dates.
- Expanded each volume into a timeline entry with a visible volume label, the normal series cover, and vertical collision lanes.
- Ordered volume rows and serialized history by normalized volume label, while automatically moving the editor viewport and keyboard focus to a newly added or repositioned row.
- Centralized approved user-facing action labels in tracked source so the same operation uses the same wording across views.

### Data model

- Uses `schema_version: 5` for newly saved records.
- Stores volume history in `volume_log`.
- Keeps the series cover in the top-level `cover` property.
- Stores `label`, optional `started_at`, and `completed_at` inside each `volume_log` entry.

## Future session template

```markdown
## X.Y.0 — Feature theme

**Release state:** Planning / Preview / Published.

### Main outcomes

- Feature-level change.

### Data model

- Persistent schema or compatibility decision, when applicable.
```
