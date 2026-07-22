# Changelog

## 1.1.2 - Unreleased

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
