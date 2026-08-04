# Architecture

AnimeList is a local-first Obsidian plugin. Markdown notes and YAML frontmatter are the source of truth; TypeScript services must preserve unrelated frontmatter and note body content.

## Runtime layers

### Application wiring

- `src/plugin-entry.ts` declares the single ordered feature manifest.
- `src/app/feature-types.ts` defines the supported feature capabilities and structural host contract.
- `src/app/feature-registry.ts` validates duplicate IDs, dependencies, declaration order, and one-time activation before dispatching capabilities.
- `src/app/anime-list-application.ts` is the single owner of storage, repository, external-media clients/search, note/update, and cover-cache services.
- `src/main.ts` owns only Obsidian lifecycle, commands, view/Markdown registration, feature dispatch, and thin host delegation.
- `src/app-metadata.ts` is the single runtime version and user-agent source.

Application wiring may compose services, but it must not implement provider normalization, Markdown serialization, settings normalization, or file-path policy. Features declare capabilities; they do not replace plugin methods, prototypes, renderers, or Obsidian persistence methods.

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
- `media-repository.ts`: the authoritative library frontmatter reader and source-identity lookup.
- `library-storage.ts`: folder, scan-root, template, and unique-path policy.
- `providers/*-client.ts`: one HTTP/API boundary per external metadata provider. AniList GraphQL transport lives only in `providers/anilist-client.ts`, so future AniList metadata methods (for example classification/tags) reuse the same endpoint and request policy.
- `external-media-provider.ts`: shared provider/page contracts and enabled-provider selection.
- `metadata-provider-clients.ts`: constructs the concrete Bangumi, AniList, and Open Library clients.
- `provider-normalizers.ts`: pure provider payload normalization and cross-provider result deduplication.
- `external-media-service.ts`: the single multi-provider orchestration boundary for multilingual discovery, direct provider search, warnings, ranking, and pagination.
- `media-note-service.ts`: note creation and cover-download workflow.
- `media-update-service.ts`: the shared typed update path used by edit forms and feature submit contributions.
- `special-label-state-service.ts`: the single favorite/masterpiece metadata writer and compatibility cleanup path.

Features and compatibility UI may call these services through narrow host ports. They must not call `processFrontMatter` directly or create another copy of persistence rules.

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

`src/legacy.ts` is a thin compatibility barrel. Active Library, Timeline, Markdown renderer, form-control, and modal implementations live under `src/ui/`; no production module imports the compatibility barrel. Add and edit modals share `createMediaEditorFields` so common fields, ordering, validation bindings, and date controls have one implementation.

- do not add implementations or domain rules to `legacy.ts`;
- do not copy typed services back into `main.ts` or feature modules;
- preserve only stable exports still required by characterization tests or downstream compatibility;
- protect moved responsibilities with behavior contracts rather than source-location assertions.

## Verification boundaries

- Unit tests cover pure domain behavior.
- Integration tests cover Obsidian-facing feature behavior.
- Contract tests protect Markdown, settings, text catalogs, services, and release CSS.
- Legacy characterization tests only freeze compatibility behavior that has not yet moved.
- Test Vault validation covers real Obsidian lifecycle and DOM behavior.

All active `src/**/*.ts` modules and Obsidian type shims must pass `tsconfig.strict.json` in addition to repository-wide TypeScript, lint, architecture, and compatibility checks.
