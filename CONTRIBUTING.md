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

To intentionally restore the controlled baseline works and current feature fixtures:

```bash
npm run test-vault:fixtures
```

The shared Test Vault uses the same managed-library layout as normal collection (`test-vault/AnimeList/Anime`, `Manga`, `Novel`) and local covers under `test-vault/AnimeList/Covers/<type>`. Fixture notes retain real source identity plus controlled user status/progress/dates and feature-specific test data. The entry page is `test-vault/_AnimeList Test Checklist.md`. Reset only rewrites the known fixture notes; unrelated manual test notes are preserved. All Test Vault files remain local and ignored by Git.

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
npm run test:legacy-update
npm run test:legacy
npm run test:feature -- timeline
npm run test:feature -- serial-covers
npm run test:list
```

`tests/legacy-characterization.test.ts` contains characterization checks that protect remaining compatibility behavior and is catalogued in the `legacy` suite. Version-update and cleanup migrations belong in the `legacy-update` suite. New product behavior belongs in dedicated feature-named files or `tests/contracts`; do not add new behavior only to the legacy suite.

Browser-sensitive UI behavior has dedicated Chromium regressions:

```bash
npm run test:browser:date
npm run test:browser:mobile
npm run test:browser:tags
npm run test:browser:tag-manager
```

## Release version metadata

`package.json` is the single hand-edited source for the AnimeList plugin version. Do not independently edit the version in `manifest.json`, the root package entries in `package-lock.json`, `versions.json`, or runtime source.

For a normal release bump, pass the new `x.y.z` value once:

```bash
npm run release:version -- <new-version>
```

The command updates `package.json` and synchronizes the derived release metadata. Runtime `PLUGIN_VERSION` is bundled directly from `package.json`. If `package.json` was edited manually, run `npm run version:sync` to regenerate the derived metadata. Historical release prose such as `CHANGELOG.md` remains intentionally authored rather than globally rewritten; `npm run release:check` requires a changelog section for the current package version.

Before opening or updating a pull request, run:

```bash
npm run check
npm run release:check
```

`npm run check` includes compatibility and strict typechecks, lint, architecture checks, automated tests, Community review preflight, a production build, and the reproducible stylesheet check.

## Architecture and compatibility boundaries

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before moving shared behavior. New persistence, normalization, provider, settings, note-media, or release-tracking rules belong in the responsible typed module, not in `src/main.ts` or `src/legacy.ts`. `src/types.ts` is a compatibility barrel; new modules should import directly from `src/domain`.

`src/main.ts` owns lifecycle, command/Markdown registration, and thin host wiring. `src/legacy.ts` is compatibility-only. New Image Section, Moments, release tracking, cleanup, and locale behavior must stay in their typed feature/domain/data/UI modules rather than being copied into either integration hotspot.

## User-visible text and localization

The runtime text catalog is `src/i18n/catalog.ts`. Locale bundles live under:

```text
src/i18n/locales/zh-TW/
src/i18n/locales/en/
src/i18n/locales/ja/
src/i18n/locales/ko/
```

`src/ui-text.ts` and feature `*-text.ts` modules are namespace helpers/facades; they are not a second independent translation store. Add new user-visible product wording to the responsible locale namespace for all supported locales, preserving per-key fallback behavior where intentionally supported.

The Settings page intentionally remains English. Do not locate controls by translated label text; expose a semantic field role, dataset marker, or typed integration hook instead.

## Styles

Styles are maintained as `styles/base.css` plus feature source files listed in `scripts/style-bundle.mjs`:

```bash
npm run styles:check   # verify the committed release bundle
npm run styles:build   # intentionally regenerate styles.css
npm run styles:dev     # watch a disposable development bundle
```

Ordinary builds must leave the working tree clean. `styles.css` is generated release output and must remain reproducible from tracked source styles.

CSS must also respect the minimum Obsidian browser baseline. Prefer Grid/Flexbox and native overflow behavior over features that the Community scanner marks only partially supported. In particular, do not reintroduce CSS multi-column layout or `scrollbar-width` / `scrollbar-color`; the Community preflight checks the generated stylesheet for these properties.

## Code and UI language

- Source code, comments, commit messages, and documentation should be written in English.
- User-facing Chinese text should use Traditional Chinese unless it comes directly from an external metadata provider.
- Add corresponding English, Japanese, and Korean locale strings for localized product UI.

## Data compatibility

Media data must remain readable as ordinary Markdown and YAML frontmatter. Do not introduce a private database as the source of truth.

When editing Markdown-backed feature blocks such as `animelist-images` and `animelist-moments`, preserve unrelated blocks, Markdown prose, and frontmatter. Image deletion must remain reference-aware so a shared managed image is not trashed while another cover, Image Section, or Moment still references it.

Release-tracking fields are additive metadata and must never be repurposed as personal reading progress. Provider failure, ambiguity, or source regression must preserve trusted stored state rather than guessing.

## Obsidian API types

Runtime imports from `obsidian` remain external and are supplied by Obsidian. The repository uses `types/obsidian.d.ts` only for compile-time declarations. Extend this file when new Obsidian APIs are used; do not add the full `obsidian` npm package unless the dependency cost is justified and installation is re-verified from an empty npm cache.
