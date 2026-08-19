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
3. Switch media type/status filters and confirm record/event counts and preview contents update together.
4. Switch to Text. Completion time and work are shown in the output but not as checkbox options; only optional details can be toggled.
5. For manga/novel serial histories, confirm completed units are split exactly like Timeline and each work line includes the localized unit + label.
6. Copy, paste into a text editor, and confirm the full output is copied even when preview is truncated.
7. Save JSON and Text and confirm files are created in `<Library root>/Exports/` with `.animelist.json` / `.txt` extensions.
8. Confirm exporting never changes media notes, frontmatter, Images, Moments, covers, or Library settings.
9. Repeat at narrow/mobile width and confirm the modal remains usable without horizontal page overflow.
