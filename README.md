# AnimeList

AnimeList is a local-first Obsidian plugin for tracking anime, manga, and novels in ordinary Markdown files. It adds a native library, metadata search, local covers, progress and rating controls, templates, favorites, filters, and a completion timeline.

Your Markdown notes remain the source of truth. Removing the plugin does not remove your records, notes, or images.

![AnimeList list view](docs/images/library-list.png)

![AnimeList completion timeline](docs/images/timeline.png)

> [!NOTE]
> **What's new in 1.1.0**
>
> - Manga and novels now use explicit reading status without relying on unreliable latest chapter or volume totals. Score and completion date are required only after completion.
> - Novel history supports whole, half (`.5`), and `EX` volumes, with normalized sorting and completion dates that default to today.
> - Novel volumes appear as separate timeline events. The timeline avoids card collisions and can filter by all records, anime, manga, or novels.

## Features

- One library for anime, manga, and novels.
- Metadata search through Bangumi, AniList, and Open Library, with broader-title fallback for localized season and subtitle names.
- Local cover downloads with remote-image fallback.
- Card, list, and compact library views.
- Search, media-type, status, genre, favorite, and sorting controls.
- Media-specific progress and completion rules.
- Per-volume novel reading history.
- Built-in and custom Markdown templates.
- A pannable and zoomable completion timeline.
- Desktop and mobile support.
- No Dataview dependency or private media database.

## Installation

### Community plugins

1. Open **Settings → Community plugins** in Obsidian.
2. Select **Browse** and search for **AnimeList**.
3. Install and enable the plugin.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the matching GitHub release.
2. Copy them into:

   ```text
   <vault>/.obsidian/plugins/animelist/
   ```

3. Reload Obsidian and enable **AnimeList** under **Community plugins**.

## Quick start

1. Open AnimeList from the ribbon or run **AnimeList: Open library** from the command palette.
2. Select **收錄** and choose anime, manga, or novel.
3. Search for a work, review the imported metadata, and save it.
4. Update status, progress, dates, rating, favorite state, or novel volumes from the library.

The interface uses Traditional Chinese. Text returned by metadata providers may remain in its original language.

## Library data

AnimeList reads and writes ordinary Markdown with YAML frontmatter. It can use either a managed library or an existing folder structure.

### Managed library

The default layout is:

```text
AnimeList/
├── Anime/
├── Manga/
├── Novel/
├── Covers/
│   ├── anime/
│   ├── manga/
│   └── novel/
└── Templates/
    ├── Anime/
    ├── Manga/
    ├── Novel/
    └── Common/
```

Flat-folder mode stores all media notes in one configured folder. **Additional scan folders** can include existing notes without moving them.

A note is discoverable when it contains a supported `media_type`:

```yaml
---
title: Example work
media_type: anime
status: watching
progress: 3
progress_total: 12
progress_unit: episode
---
```

Supported media types are `anime`, `manga`, and `novel`. Existing published 1.0.x notes remain readable; editing writes the current schema while preserving unrelated frontmatter and note content.

## Progress and completion rules

- **Anime:** completed progress synchronizes to a known episode total.
- **Manga:** progress records the current chapter; completion is selected explicitly.
- **Novel:** progress records the current volume and accepts whole numbers, `.5`, and `EX`.
- **Completed works:** personal score and completion date are required.
- **Active, planned, or paused works:** score and completion date may be empty.

Novel notes can additionally keep local per-volume history:

```yaml
volume_log:
  - label: "1"
    completed_at: "2026-01-08"
  - label: "2.5"
    started_at: "2026-02-01"
    completed_at: "2026-02-08"
  - label: "EX"
    completed_at: "2026-03-14"
```

Each completed volume becomes its own timeline event while reusing the series cover.

## Templates

AnimeList always includes a minimal built-in template. Custom Markdown templates can be placed under the configured template folder in `Anime`, `Manga`, `Novel`, or `Common` subfolders.

Supported variables include:

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

## Metadata and privacy

- Bangumi and AniList provide anime, manga, and light-novel metadata.
- Open Library provides general novel and book metadata.
- Search terms are sent only to enabled providers.
- Personal scores, progress, dates, favorites, and note bodies stay in the vault.

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

See [CONTRIBUTING.md](CONTRIBUTING.md), the [manual test checklist](docs/MANUAL_TEST_CHECKLIST.md), and [CHANGELOG.md](CHANGELOG.md) for project and release details.

## License

[MIT](LICENSE)
