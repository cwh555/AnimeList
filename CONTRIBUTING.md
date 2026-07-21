# Contributing

## Development setup

1. Install Node.js 18 or newer.
2. Run `npm ci`.
3. Run `npm run check`.
4. Run `npm run dev` while editing.
5. For manual Obsidian testing, copy `main.js`, `manifest.json`, and `styles.css` into a vault you control. Do not commit that vault or its media records.

Before opening a pull request, run:

```bash
npm run check
```

## Code and UI language

- Source code, comments, commit messages, and documentation should be written in English.
- User-facing Chinese text should use Traditional Chinese unless it comes directly from an external metadata provider.

## Data compatibility

Media data must remain readable as ordinary Markdown and YAML frontmatter. Do not introduce a private database as the source of truth.
## Obsidian API types

Runtime imports from `obsidian` remain external and are supplied by Obsidian. The repository uses `types/obsidian.d.ts` only for compile-time declarations. Extend this file when new Obsidian APIs are used; do not add the full `obsidian` npm package unless the dependency cost is justified and installation is re-verified from an empty npm cache.
