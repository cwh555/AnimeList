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

Application wiring may compose services, but it must not implement provider normalization, Markdown serialization, settings normalization, note-media persistence, release-tracking rules, or file-path policy. Features declare capabilities; they do not replace plugin methods, prototypes, renderers, or Obsidian persistence methods.

### Domain

`src/domain/` contains typed values and pure normalization shared across features. Important modules include:

- `media-types.ts`: media, external-result, note-form, and serial-progress contracts.
- `settings-types.ts`: persisted core and feature-settings contracts.
- `media-metadata.ts`: genre and metadata normalization.
- `media-classification.ts`: typed AniList classification values and persistence-safe tag filtering.
- `value-normalization.ts`: safe scalar, array, path, and identifier helpers.
- `image-section.ts`: `animelist-images` parsing, serialization, insertion, image-path normalization, and managed image-folder rules.
- `moments.ts`: typed `animelist-moments` entries, stable IDs, optional metadata, parsing/serialization, and block replacement.
- `media-image-references.ts`: shared image-reference accounting used before managed images are trashed.
- `release-tracking.ts`: release-tracking states, persisted binding/snapshot parsing, manga chapter semantics, and novel publication-line matching.
- `manga-release-sources.ts`: supported official manga-source identities and URL normalization.
- `version-cleanup.ts`: strict review/apply planning for version-specific cleanup.

`src/types.ts` remains a compatibility re-export barrel. New modules should import the responsible domain module directly.

### Data and services

`src/data/` owns persistent and external boundaries:

- `media-note-codec.ts`: the only core Markdown/YAML media-note writer.
- `media-repository.ts`: the authoritative library frontmatter reader and source-identity lookup.
- `library-storage.ts`: folder, scan-root, template, and unique-path policy.
- `providers/*-client.ts`: one transport/API boundary per external provider.
- `providers/anilist-client.ts`: reusable AniList GraphQL transport for search/classification and preserved-identity external-link discovery.
- `providers/mangadex-release-client.ts`: MangaDex release binding and chapter evidence.
- `providers/official-manga-release-client.ts`: supported public official manga chapter-source adapters.
- `providers/ndl-release-client.ts`: NDL/JPRO publication discovery for novels.
- `external-media-provider.ts`: shared provider/page contracts and enabled-provider selection.
- `metadata-provider-clients.ts`: constructs the concrete Bangumi, AniList, and Open Library clients.
- `provider-normalizers.ts`: pure provider payload normalization and cross-provider result deduplication.
- `media-classification-service.ts`: optional classification enrichment after a work is selected; failure never blocks note creation.
- `external-media-service.ts`: the single multi-provider orchestration boundary for multilingual discovery, direct provider search, warnings, ranking, and pagination.
- `media-note-service.ts`: note creation and series-cover download workflow.
- `media-update-service.ts`: the shared typed update path used by edit forms and feature submit contributions.
- `special-label-state-service.ts`: the single Favorite/Masterpiece metadata writer and compatibility cleanup path.
- `image-section-service.ts`: Image Section asset import, exact/canonical-raster duplicate checks, thumbnail requests, Markdown updates, Set as cover, and reference-aware deletion.
- `moments-service.ts`: Moment creation/edit/delete, managed image import, stable-ID preservation, and reference-aware image cleanup.
- `release-tracking-service.ts`: provider orchestration, safe binding/refresh behavior, official-source evidence comparison, and refresh summaries.
- `release-tracking-state-service.ts`: scoped release-tracking frontmatter reads/writes that preserve unrelated YAML and note bodies.
- `version-cleanup-service.ts`: candidate scan, review, revalidation, and narrow cleanup application.

Features and compatibility UI may call these services through narrow host ports. They must not create another copy of persistence or provider-selection rules.

### Release tracking boundary

Release tracking is deliberately separate from personal reading progress.

- Manga tracking can use a verified MangaDex binding and, when the note preserves AniList identity, supported official public chapter pages discovered from that exact AniList work.
- Novel tracking uses NDL/JPRO publication records and keeps main-line volume matching separate from side publications and adaptations.
- `latest_chapter` / `latest_volume` and `release_tracking_*` fields are additive provider state.
- `progress`, `progress_unit`, `volume_log`, status, rating, and note prose are never rewritten to match a provider result.
- Ambiguous, unmatched, provider-error, and source-regression states preserve trusted data for review instead of guessing.

### Note-media boundary

Image Sections and Moments are ordinary fenced Markdown blocks that can appear multiple times in one note.

- `animelist-images` stores a visible list of image paths only.
- `animelist-moments` stores typed text/image entries and optional `source`, `position`, `speaker`, `tags`, and `note` fields.
- The editor context menu inserts new blocks without replacing surrounding Markdown.
- UI services update only the located target block.
- Managed images use the shared image-reference boundary before deletion; a file still referenced by a cover, another Image Section, or another Moment must remain in the vault.
- Gallery thumbnails are cache artifacts; lightbox and clipboard operations use original images.

### Settings

- `src/settings-model.ts` owns defaults and normalization.
- `src/settings-store.ts` owns load/normalize/save sequencing.
- `src/settings-layout.ts` owns the five typed top-level Settings pages, feature placement, and tab keyboard navigation.
- `src/settings.ts` renders Settings against the already-normalized shared settings object.

The Settings pages are:

1. General
2. Search & metadata
3. Features
4. Maintenance
5. Updates & cleanup

Feature settings share the same Obsidian data document. Normalization must preserve unknown top-level and nested values so newer or optional feature settings are not erased. The selected Settings page is runtime-only UI state.

### User-visible text and localization

- `src/i18n/catalog.ts` provides locale selection, namespace registration, interpolation, and per-key fallback.
- `src/i18n/locale.ts` and `src/i18n/obsidian-locale.ts` normalize explicit and Obsidian-derived interface locale choices.
- `src/i18n/locales/{zh-TW,en,ja,ko}/` contains the supported product locale namespaces.
- `src/i18n/provider-tag-localization.ts` maps recognized provider taxonomy values to display-only localized labels while preserving unknown/custom text.
- `src/ui-text.ts` and feature `*-text.ts` modules are typed namespace accessors/facades rather than independent translation stores.

UI code must request displayed wording through a catalog helper. DOM integration must use semantic attributes or typed controls, never localized label text. The Settings page intentionally renders in English; interface-language changes apply to AnimeList product views/dialogs/notices without rewriting stored media titles, tags, frontmatter, notes, or templates.

### Styles

Styles have independent sources:

- `styles/base.css`
- `styles.*.css` feature files listed in `scripts/style-bundle.mjs`

`styles.css` is the committed generated release artifact. Normal builds run `npm run styles:check` and never rewrite tracked source files. Run `npm run styles:build` only when intentionally updating the release artifact.

Release CSS must respect the declared minimum Obsidian browser baseline. Prefer Grid/Flexbox and baseline overflow behavior over features reported as partially supported by Community review. The preflight rejects generated CSS that reintroduces multi-column layout or `scrollbar-width` / `scrollbar-color`.

## Compatibility boundary

`src/legacy.ts` is a thin compatibility barrel. Active Library, Timeline, Markdown renderer, form-control, and modal implementations live under `src/ui/`; no production module should add new behavior to the compatibility barrel. Add and edit modals share `createMediaEditorFields` so common fields, ordering, validation bindings, and date controls have one implementation.

- do not add implementations or domain rules to `legacy.ts`;
- do not copy typed services back into `main.ts` or feature modules;
- preserve only stable exports still required by characterization tests or downstream compatibility;
- protect moved responsibilities with behavior contracts rather than source-location assertions.

## Data compatibility

- Existing Markdown/frontmatter remains readable when optional features are disabled.
- The media schema remains independent from Image Section and Moments fenced blocks.
- Release-tracking metadata is additive and must preserve unrelated frontmatter/body content.
- Interface localization is display-only for provider taxonomy and must not rewrite stored values when the locale changes.
- Cleanup operations are explicit and review-first; no version-update cleanup runs automatically on startup.

## Verification boundaries

- Unit tests cover pure domain behavior.
- Integration tests cover Obsidian-facing feature behavior.
- Contract tests protect Markdown, settings, text catalogs, services, provider clients, and release CSS.
- `legacy-update` tests protect explicit migrations/cleanup behavior.
- Legacy characterization tests freeze only compatibility behavior that has not yet moved.
- Browser regressions cover keyboard, responsive layout, tag-chip, and Tag Manager behavior.
- Test Vault validation covers real Obsidian lifecycle, external-provider flows, Markdown rendering, note-media interaction, Settings, and DOM behavior.

All active `src/**/*.ts` modules and Obsidian type shims must pass `tsconfig.strict.json` in addition to repository-wide TypeScript, lint, architecture, compatibility, Community, and release checks.
