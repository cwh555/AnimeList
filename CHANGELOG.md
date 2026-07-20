# Changelog

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
