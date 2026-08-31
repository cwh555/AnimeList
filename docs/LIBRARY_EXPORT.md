# Library Export

Library Export is a portable view of AnimeList's Library state. It is intentionally not a full Vault backup: Markdown bodies, Image Sections, Moments, cached thumbnails, plugin settings, and arbitrary unknown frontmatter are not copied into the export.

## Entry point

Open the AnimeList workspace and choose the explicit **Export** action in the top workspace navigation. The command palette also exposes **Export Library**. Up to two workspace actions are shown directly; only additional actions use the overflow menu. When Release Tracking is enabled, **Release updates** and **Export** therefore remain directly visible instead of both being hidden behind `…`.

The export modal supports:

- JSON or Text output.
- All / Anime / Manga / Novel scope.
- All / Ongoing / Completed / Planned / Dropped status scope.
- A live preview.
- Copying the full export to the clipboard.
- Saving the full export as a file under `<Library root>/Exports/`.

The footer shows the exact export folder. **Save export file** only creates a new `.animelist.json` or `.txt` export file there; it does not edit media notes or other Library data.

Preview text may be truncated for large libraries; Copy and Save still use the complete output.

### Interaction and layout

The modal is mounted once. Format buttons, scope selectors, and the Text template editor update only their own state and the existing preview textarea; they do **not** rebuild the modal DOM. This keeps focus, scroll position, and control identity stable while options are changed.

On desktop, controls occupy a compact left column and the preview gets the larger right column. On narrow/mobile layouts the same sections stack vertically. Format, scope, Text template, preview, and footer actions are visually separated instead of sharing one dense form grid.

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

Text export shares the same completion-event source used by Timeline. Manga and novel serial completions are split into individual events, and the `work` template value uses Timeline's localized serial-entry title. For example, the work value becomes `葬送的芙莉蓮 — 第 13 卷` rather than losing the unit and label.

Text output is controlled by a safe, per-event template. **Work is the only required variable** so each exported block remains identifiable; completion time and every other supported variable are optional. In Traditional Chinese the default remains:

```text
{$完成時間}
{$作品名稱}
  作品類型：{$作品類型}
```

A user can replace it with another supported layout that still contains the work name, such as:

```text
({$作品類型}) {$作品名稱} : {$完成時間}
```

or:

```text
{$作品名稱} | {$評分}
```

The variable buttons insert supported tokens at the caret. Available values include completion time, Timeline-style work name, base series name, media type, serial unit, original title, score, progress, started time, status, the active special-label value, and genres/tags.

The special-label variable follows **Settings → Special label mode**. In Favorite mode its visible variable name is the localized Favorite label (for example `{$最愛}` in Traditional Chinese); the value is emitted only for favorite works and is blank for other works. In Masterpiece mode the visible variable name is the localized Masterpiece label (currently `{$masterpiece}` in Traditional Chinese); marked works output their actual masterpiece category names, while unmarked works output nothing. If a legacy masterpiece has no explicit category, the existing default `masterpiece` category semantics are preserved. Previously valid Favorite/Masterpiece token names remain accepted as aliases when the setting is changed, so switching modes does not invalidate an existing template.

### Template safety rules

The Text template is deliberately **not** a shell, JavaScript, expression language, or `eval` surface. It only performs bounded literal substitutions:

- template length is capped at 4096 characters;
- at most 64 variable references are accepted;
- unknown or unclosed variables make the template invalid;
- the work variable is required; every other supported variable is optional;
- inserted values are never parsed again, so a title containing `{$評分}` remains literal text;
- no variable can alter the export path or filename;
- `\{$` emits a literal `{$` opener.

When the template is invalid, the modal shows the validation error and disables Copy / Save until it is fixed. The preview updates in place while typing without rebuilding the modal.

Text is a human-readable report and is not intended to be reversible. Future Import should consume only the versioned JSON format.

## First-version review checklist

1. With Release Tracking disabled, **Export** is a direct top workspace action. Enable Release Tracking and confirm **Release updates** and **Export** are both still directly visible; neither should move into `…`. A third workspace action should use the overflow menu instead.
2. JSON starts with `animelist-library-export` / version `1` and contains one record per scoped Library work.
3. Switch format and media type/status filters repeatedly. Controls/focus must stay stable with no full-modal flash while record/event counts and preview update.
4. Switch to Text and edit the template continuously. Typing and variable insertion must keep the same editor/preview DOM nodes and must not flash or reset focus.
5. Try `({$作品類型}) {$作品名稱} : {$完成時間}` and confirm manga/novel events still include Timeline unit labels such as `第 13 卷` / `第 42 話`.
6. Remove `{$作品名稱}` and confirm Copy / Save disable with the missing-work error. Restore it and use a minimal template such as `{$作品名稱} | {$評分}`; completion time and other variables should remain optional.
7. In Favorite mode, include `{$最愛}` and confirm only favorite works show the Favorite label. In Masterpiece mode, include `{$masterpiece}` and confirm only masterpiece works show their actual category names. Existing templates using the previous special-label token name should remain valid after switching modes.
8. Enter an unknown variable such as `{$不存在}` and confirm Copy / Save disable until the template is valid again.
9. Confirm the desktop modal uses a controls column + larger preview column; at narrow/mobile width the sections stack cleanly without horizontal overflow.
10. Copy and paste into a text editor; the full output must be copied even when preview is truncated.
11. Use **Save export file** and confirm the displayed destination matches the created file under `<Library root>/Exports/` with `.animelist.json` / `.txt` extension.
12. Confirm exporting never changes media notes, frontmatter, Images, Moments, covers, or Library settings.
