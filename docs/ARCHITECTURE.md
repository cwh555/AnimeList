# Architecture

AnimeList is a local-first Obsidian plugin. Markdown notes and YAML frontmatter are the source of truth; TypeScript services must preserve unrelated frontmatter and note body content.

## Runtime layers

### Application wiring

- `src/plugin-entry.ts` installs feature integrations in one place.
- `src/main.ts` owns plugin lifecycle, commands, Obsidian views, and compatibility-facing method adapters.
- `src/app-metadata.ts` is the single runtime version and user-agent source.

Application wiring may compose services, but it must not implement provider normalization, Markdown serialization, settings normalization, or file-path policy.

### Domain

`src/domain/` contains typed values and pure normalization shared across features:

- `media-types.ts`: media, external-result, note-form, and serial-progress contracts.
- `settings-types.ts`: persisted core settings contracts.
- `media-metadata.ts`: genre and metadata normalization.
- `value-normalization.ts`: safe scalar, array, path, and identifier helpers.

`src/types.ts` remains a compatibility re-export barrel. New modules should import the responsible domain module directly.

### Data and services

`src/data/` owns persistent and external boundaries:

- `media-note-codec.ts`: the only Markdown/YAML note writer.
- `media-repository.ts`: the only library frontmatter reader and favorite updater.
- `library-storage.ts`: folder, scan-root, template, and unique-path policy.
- `provider-normalizers.ts`: provider payload normalization and result deduplication.
- `external-media-service.ts`: provider orchestration, query variants, warnings, and ranking.
- `media-note-service.ts`: note creation and cover-download workflow.

Features and compatibility UI may call these services. They must not create another copy of their rules.

### Settings

- `src/settings-model.ts` owns defaults and normalization.
- `src/settings-store.ts` owns load/normalize/save sequencing.
- `src/settings.ts` renders settings definitions against the already-normalized shared settings object.

Feature settings share the same Obsidian data document. Normalization must preserve unknown top-level and nested values so newer or optional feature settings are not erased.

### User-visible text

- `src/i18n/catalog.ts` provides locale selection, namespace registration, interpolation, and per-key fallback.
- `src/ui-text.ts` owns the core catalog.
- `src/*-text.ts` files own feature catalogs.

UI code must request displayed wording through a catalog helper. DOM integration must use semantic attributes or typed controls, never localized label text. Translation bundles may register complete or partial namespaces without changing feature logic.

### Styles

Styles have independent sources:

- `styles/base.css`
- `styles.*.css` feature files listed in `scripts/style-bundle.mjs`

`styles.css` is the committed release artifact. Normal builds run `npm run styles:check` and never rewrite tracked source files. Run `npm run styles:build` only when intentionally updating the release artifact.

## Compatibility boundary

`src/legacy.ts` still contains the active compatibility UI. During Stage 2 it delegates shared persistence and normalization to the typed domain/data services. Stage 3 will replace runtime method reassignment and move active UI composition out of this file. Until then:

- do not add new domain rules to `legacy.ts`;
- do not copy a typed service back into `main.ts`;
- preserve its public methods used by existing modals and feature adapters;
- replace source-shape tests with behavior contracts whenever a responsibility moves.

## Verification boundaries

- Unit tests cover pure domain behavior.
- Integration tests cover Obsidian-facing feature behavior.
- Contract tests protect Markdown, settings, text catalogs, services, and release CSS.
- Legacy characterization tests only freeze compatibility behavior that has not yet moved.
- Test Vault validation covers real Obsidian lifecycle and DOM behavior.

New modules under `src/domain`, `src/data`, `src/i18n`, and `src/ui` must pass `tsconfig.strict.json` in addition to the repository-wide TypeScript and lint checks.
