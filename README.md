# AnimeList

AnimeList is a local-first Obsidian plugin for tracking anime, manga, and novels in ordinary Markdown files. It provides a native library, metadata search, local covers, progress tracking, ratings, templates, a Score Dashboard, and a completion timeline.

Your Markdown notes remain the source of truth. Removing the plugin does not remove your records, notes, or images.

<table>
  <tr>
    <td colspan="2" align="center">
      <img src="docs/images/library-card.webp" alt="AnimeList library in card view" width="100%"><br>
      <sub><b>Library</b></sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/images/score-dashboard.svg" alt="AnimeList Score Dashboard"><br>
      <sub><b>Score Dashboard</b></sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/images/timeline.webp" alt="AnimeList completion timeline"><br>
      <sub><b>Timeline</b></sub>
    </td>
  </tr>
</table>

> [!NOTE]
> **What's new in 1.3.0**
>
> - Added richer media metadata for format, animation studio or author, anime quarter, AniList classification tags, and source material while keeping Markdown as the source of truth.
> - Added a Library filter dialog for animation company, quarter, and reusable work tags. Company and tag selections can be combined; all filter groups apply together.
> - Added an English **Tag manager** in Settings with search, add, rename, global delete, usage counts, and per-work removal without deleting the reusable tag itself.
> - Improved animation-studio reliability with structured AniList data and Bangumi animation-production relations, including canonical company identity so formatting variants do not create duplicate filters.
> - Made large libraries faster with a cached media index, scoped refreshes, progressive card rendering, demand-loaded thumbnails, and lazy Score Dashboard cover work.
> - Added a mobile-first phone layout for the Library, Score Dashboard, media editors, serial entries, and Timeline while preserving tablet and desktop layouts.
> - Added consistent keyboard navigation across manga and novel serial-entry rows, including Enter/Tab progression and previous-field Backspace navigation.
> - Reorganized external metadata providers behind typed clients so search and Load More share the same Bangumi, AniList, and Open Library behavior.

> [!DANGER]
> **Existing libraries and legacy metadata**
>
> Stable 1.2.1 notes remain readable and AnimeList does not automatically rewrite the library on startup. To backfill the new company/quarter metadata for existing notes, or if the vault has ever used preview/development builds that wrote `user_tags`, `classification_*`, mixed tag/studio values, or malformed company data, make sure the vault is backed up or synced and run **Settings → Legacy metadata cleanup → Scan and upgrade** once. The cleanup rewrites only recognized AnimeList metadata fields into the current schema and preserves unrelated frontmatter and Markdown body content.

## Features

- One Markdown-based library for anime, manga, and novels.
- Metadata search through Bangumi, AniList, and Open Library, with structured classification metadata for supported works.
- Card, list, and poster views with search, sorting, and combined company, quarter, and tag filters.
- Media-specific progress tracking and dated serial entries with optional per-entry covers.
- A Score Dashboard for direct and batch rating changes.
- Favorite mode or reusable Masterpiece categories.
- A pannable and zoomable completion timeline.
- Local series and serial-entry covers with remote-image fallback.
- Desktop and mobile support without a Dataview dependency.

## Installation

### Community plugins

1. Open **Settings → Community plugins** in Obsidian.
2. Select **Browse** and search for **AnimeList**.
3. Install and enable the plugin.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the matching GitHub release.
2. Copy them into `<vault>/.obsidian/plugins/animelist/`.
3. Reload Obsidian and enable **AnimeList** under **Community plugins**.

## Quick start

1. Open AnimeList from the ribbon or run **AnimeList: Open library** from the command palette.
2. Select **收錄**, choose anime, manga, or novel, and search for a title.
3. Review the imported metadata and save the note.
4. Update its status, progress, dates, rating, or special label from the library.

The main Library and media workflow uses Traditional Chinese. The 1.3 Tag manager and legacy-cleanup Settings tools use English. Provider metadata may remain in its original language.

## Documentation

See the [User Guide](docs/USER_GUIDE.md) for status rules, progress units, serial-entry covers, metadata and filters, reusable tags, legacy cleanup, Masterpiece categories, the Score Dashboard, the timeline, Markdown data, and templates.

## Metadata and privacy

- Search terms are sent only to enabled metadata providers.
- Personal ratings, progress, dates, labels, and note content stay in the vault.
- Covers are stored locally when available, with remote-image fallback.

## Development

Requirements: Node.js 18 or newer and npm.

```bash
npm ci
npm run check
```

For a production bundle:

```bash
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md), the [manual test checklist](docs/MANUAL_TEST_CHECKLIST.md), [CHANGELOG.md](CHANGELOG.md), and [ROADMAP.md](ROADMAP.md) for project details.

## License

[MIT](LICENSE)
