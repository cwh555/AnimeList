# Contributing

## Development setup

1. Install Node.js 18 or newer.
2. Run `npm ci`.
3. Run `npm run check` before committing.

For development with an Obsidian test vault:

```bash
npm run test-vault:dev
```

This creates the ignored local `test-vault`, writes the development bundle directly into its plugin directory, prepares the shared real-work library, opens `_AnimeList Test Checklist.md`, and watches source files. Reload AnimeList in Obsidian after a rebuild.

Before a release, run the production-equivalent manual test setup:

```bash
npm run test-vault
```

This runs the complete repository checks, verifies release consistency, installs only `main.js`, `manifest.json`, and `styles.css`, prepares the shared library, and opens the checklist in the ignored test vault. This mode deliberately avoids repository-directory symlinks so it matches a manual GitHub Release installation.

`npm run test-vault` is intentionally non-destructive for media data. Existing current fixtures and downloaded covers are reused, so edits made during manual testing survive reopening the vault and duplicate media are not created. A missing cached cover is repaired without rewriting the note.

To intentionally restore the 18 controlled baseline works:

```bash
npm run test-vault:fixtures
```

The shared Test Vault uses the same managed-library layout as normal collection (`test-vault/AnimeList/Anime`, `Manga`, `Novel`) and local covers under `test-vault/AnimeList/Covers/<type>`. Fixture notes retain real Bangumi source identity plus local/remote cover metadata, while user status/progress/dates remain controlled test scenarios. The entry page is `test-vault/_AnimeList Test Checklist.md`. Reset only rewrites the known fixture notes; unrelated manual test notes are preserved. All Test Vault files remain local and ignored by Git.

To use another disposable vault:

```bash
ANIMELIST_TEST_VAULT=/absolute/path/to/vault npm run test-vault
```

Use `-- --no-open` when the vault should be prepared without launching Obsidian.

## Targeted automated tests

The complete test command remains:

```bash
npm test
```

Tests are cataloged by layer and functionality, so a branch can run the smallest relevant suite while developing:

```bash
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:legacy
npm run test:feature -- timeline
npm run test:feature -- serial-covers
npm run test:list
```

`tests/legacy-characterization.test.ts` contains characterization and source-structure checks that protect the current compatibility implementation and is catalogued in the `legacy` suite. New behavior tests belong in dedicated feature-named files or `tests/contracts`; do not add new product behavior only to the legacy suite.

Before opening a pull request, run:

```bash
npm run check
npm run release:check
```

`npm run check` includes both the compatibility typecheck and the strict typecheck for new domain, data, i18n, and shared UI modules.

## Architecture and compatibility boundaries

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before moving shared behavior. New persistence, normalization, provider, or settings rules belong in the responsible typed module, not in `src/main.ts` or `src/legacy.ts`. `src/types.ts` is a compatibility barrel; new modules should import directly from `src/domain`.

User-visible text must be added to `src/ui-text.ts` or a feature `*-text.ts` catalog. Do not locate controls by translated label text; expose a semantic field role or typed integration hook instead.

Styles are maintained as `styles/base.css` plus feature source files. Use:

```bash
npm run styles:check   # verify the committed release bundle
npm run styles:build   # intentionally regenerate styles.css
npm run styles:dev     # watch a disposable development bundle
```

Ordinary builds must leave the working tree clean.

Do not commit the test vault, its media data, generated fixtures, or Obsidian workspace state.

## Code and UI language

- Source code, comments, commit messages, and documentation should be written in English.
- User-facing Chinese text should use Traditional Chinese unless it comes directly from an external metadata provider.

## Data compatibility

Media data must remain readable as ordinary Markdown and YAML frontmatter. Do not introduce a private database as the source of truth.
## Obsidian API types

Runtime imports from `obsidian` remain external and are supplied by Obsidian. The repository uses `types/obsidian.d.ts` only for compile-time declarations. Extend this file when new Obsidian APIs are used; do not add the full `obsidian` npm package unless the dependency cost is justified and installation is re-verified from an empty npm cache.
