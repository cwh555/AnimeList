# Library Export

Library Export is a portable view of AnimeList's Library state. It is intentionally not a full Vault backup: Markdown bodies, Image Sections, Moments, cached thumbnails, plugin settings, and arbitrary unknown frontmatter are not copied into the export.

## Entry point

Open the AnimeList workspace and choose the explicit **Export** action in the top workspace navigation. The command palette also exposes **Export Library**. A single workspace action is shown directly; the overflow menu is reserved for multiple actions.

The export modal supports:

- JSON or Text output.
- All / Anime / Manga / Novel scope.
- All / Ongoing / Completed / Planned / Dropped status scope.
- A live preview.
- Copying the full export to the clipboard.
- Saving the full export under `<Library root>/Exports/`.

Preview text may be truncated for large libraries; Copy and Save always use the complete output.

### Interaction and layout

The modal is mounted once. Format buttons, scope selectors, and Text-field checkboxes update only their own state and the existing preview textarea; they do **not** rebuild the modal DOM. This keeps focus, scroll position, and control identity stable while options are changed.

On desktop, controls occupy a compact left column and the preview gets the larger right column. On narrow/mobile layouts the same sections stack vertically. Format, scope, optional Text details, preview, and footer actions are visually separated instead of sharing one dense form grid.

## JSON contract

JSON uses a stable versioned envelope:

```json
{
  "format": "animelist-library-export",
  "version": 1,
  "exportedAt": "2026-08-19T01:00:00.000Z",
  "records": []
}
```

Each record contains only portable Library state needed for analysis and a future Import path:

- title, original/romaji title when stored, media type, format;
- Library status and release status where applicable;
- progress, progress unit, and anime total;
- score, favorite, started/completed dates;
- manga/novel serial entries with their dates and optional cover provenance;
- year/season/classification metadata, genres/media tags, people/platforms;
- source provider/id, AniList id, and source URLs;
- original note path as a restore hint;
- local/remote cover references.

The JSON deliberately excludes filesystem mtime-derived values, provider scores, note templates, serial-entry `extra` payloads, arbitrary frontmatter, note body Markdown, Images, and Moments.

The note path and local cover paths are hints, not portable identity. A future Import should match records by provider + source id, then AniList id, then a reviewed media-type/title fallback.

### Import contract readiness

V1 still does not expose an Import UI or write imported notes. It does include a typed Import contract parser used by automated tests. The parser accepts only `animelist-library-export` version `1`, rejects malformed nested records, rejects foreign/unsupported formats, and exposes match candidates in the intended **source → AniList → title** order. A cross-contract test feeds JSON produced by the current Export record builder back through this parser and verifies that status, progress, serial history, and source identity survive intact.

## Text contract

Text export shares the same completion-event source used by Timeline. This prevents Timeline and Export from developing separate serial-entry rules.

Completion time and work are always emitted and therefore are **not** shown as checkboxes. Optional details are:

- Media type
- Original title
- Score
- Progress
- Started at
- Status
- Favorite
- Genres / tags

For manga and novels with completed serial entries, each completed chapter/season/volume becomes its own event. The work line reuses Timeline's localized serial-entry title, so the unit and label are always explicit (for example `第 13 卷`, `第 42 話`, or `第 2 季`). Once serial completion entries exist for a work, Text export does not add a second whole-work completion event. Anime and works without completed serial entries use the whole-work completed date when the work is completed.

Text is formatted as readable event blocks rather than a pipe-delimited table. Blank lines separate events, and selected optional details are indented below the work:

```text
2026-05-03
葬送的芙莉蓮 — 第 13 卷
  作品類型：漫畫
  評分：9

2026-06-12
葬送的芙莉蓮 — 第 14 卷
  作品類型：漫畫
  評分：9

2026-07-01
劇場版作品
  作品類型：動畫
```

Text is a human-readable report and is not intended to be reversible. Future Import should consume only the versioned JSON format.

## First-version review checklist

1. Use the explicit **Export** workspace action from each workspace page; the same modal should open and there should be no one-item `…` menu.
2. JSON starts with `animelist-library-export` / version `1` and contains one record per scoped Library work.
3. Switch format, media type/status filters, and several Text checkboxes repeatedly. Controls/focus must stay stable with no full-modal flash or reset while record/event counts and preview contents update.
4. Confirm the desktop modal uses a controls column + larger preview column; at narrow/mobile width the sections stack cleanly without horizontal overflow.
5. Switch to Text. Completion time and work are shown in the output but not as checkbox options; only optional details can be toggled.
6. For manga/novel serial histories, confirm completed units are split exactly like Timeline and each work line includes the localized unit + label.
7. Copy, paste into a text editor, and confirm the full output is copied even when preview is truncated.
8. Save JSON and Text and confirm files are created in `<Library root>/Exports/` with `.animelist.json` / `.txt` extensions.
9. Confirm exporting never changes media notes, frontmatter, Images, Moments, covers, or Library settings.
