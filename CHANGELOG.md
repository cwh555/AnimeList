# Changelog

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
