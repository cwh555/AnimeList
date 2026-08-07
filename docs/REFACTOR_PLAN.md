# Three-stage refactor plan

AnimeList will be refactored in three independently validated stages. Each stage starts from the latest `preview`, uses a dedicated branch and Draft pull request, and must pass automated validation before Test Vault review. No stage may remove or rewrite Markdown content, unrelated frontmatter, or existing feature behavior.

## Design references

The plan follows patterns used by established TypeScript and Obsidian projects without copying their frameworks wholesale:

- The official [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin) keeps the plugin entry buildable from `src/main.ts` while explicitly allowing functionality to move into additional TypeScript modules. Its recommended workflow includes linting and GitHub Actions checks.
- [Obsidian Dataview](https://github.com/blacksmithgu/obsidian-dataview) separates API, data-index, data-model, query, and UI responsibilities and requires build, formatting, and tests before pull requests.
- [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) and [Meta Bind](https://github.com/mProjectsCode/obsidian-meta-bind-plugin) maintain larger feature-oriented TypeScript codebases with automated checks plus an example or test vault workflow.
- The [Node.js test runner](https://nodejs.org/api/test.html) supports file-level process isolation and targeted execution. AnimeList keeps `node:test` and esbuild rather than adding another test framework.

These references support the direction, but AnimeList keeps its current local-first Markdown model and avoids introducing unnecessary framework or dependency layers.

## Stage 1 — Test foundation (completed)

Scope:

- Catalog existing feature-named tests by functionality without unnecessary file moves.
- Classify the source- and layout-dependent characterization file in the `legacy` suite without rewriting its behavior.
- Add a typed test catalog with `unit`, `integration`, `contract`, and `legacy` suites.
- Allow tests to run by suite or feature.
- Add compatibility contracts for Markdown generation, settings normalization, and user-visible text catalogs.
- Run every bundled test file in an isolated Node process.

Runtime behavior and production source files are intentionally unchanged in this stage.

Required validation:

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:legacy
npm run check
npm run release:check
```

After GitHub Actions succeeds, the branch must be tested in Test Vault before it can be squash-merged into `preview`.

## Stage 2 — Core boundaries, settings, text, and styles (completed)

Scope:

- Introduce one settings load/normalize/save pipeline.
- Introduce a single media repository and Markdown codec used by both active and compatibility paths.
- Consolidate user-visible text behind a locale-ready catalog interface while preserving the current displayed wording.
- Split shared domain types by responsibility and enable stricter checking for newly typed modules.
- Make base and feature styles independent sources; normal builds must not rewrite source CSS as a side effect.
- Keep `main.ts` focused on lifecycle, commands, and wiring.

Meaningful modules must own a coherent responsibility. Long files will not be split merely to reduce line count, and no third copy of existing domain logic may be created.

Implemented boundaries in this stage:

- `AnimeListSettingsStore` and `normalizeAnimeListSettings` are the single settings load/normalize/save path.
- `MediaRepository`, `media-note-codec`, `LibraryStorage`, `ExternalMediaSearchService`, and `MediaNoteService` own shared persistence and provider workflows.
- Core and feature text helpers use locale-ready catalogs with fallback and incremental locale registration.
- Domain, data, i18n, and shared UI modules pass an additional strict TypeScript configuration.
- Base and feature styles are independent sources; ordinary builds verify rather than rewrite `styles.css`.
- `main.ts` keeps compatibility method adapters while provider, Markdown, folder, and settings rules live in typed services.

Required compatibility coverage:

- Existing Markdown and frontmatter remain readable.
- Unknown frontmatter and note body content remain unchanged.
- Existing settings retain their values across reload.
- Current Traditional Chinese and English UI wording remains unchanged.
- Release `styles.css` remains reproducible.

## Stage 3 — Feature composition and legacy removal (implementation complete)

Scope:

- Replace runtime method/prototype/renderer reassignment with typed feature capability instances.
- Replace document-wide form discovery with explicit form contexts and submit contributions.
- Move active Library, Timeline, add/edit, detail, and Markdown UI out of `src/legacy.ts`.
- Keep provider, pagination, create, update, favorite, and masterpiece persistence in single typed service paths.
- Make `src/main.ts` an Obsidian lifecycle and wiring adapter rather than an application-service container.

Implemented boundaries:

- `src/plugin-entry.ts` is the only feature manifest.
- `src/app/feature-types.ts` defines lifecycle, media-item, Library, search, form, favorite, settings, and detail capabilities.
- `src/app/feature-registry.ts` validates IDs and dependencies before any feature activates.
- `src/app/anime-list-application.ts` owns service construction and data operations, including the dedicated special-label state service.
- Active UI lives in typed modules under `src/ui/`; `src/legacy.ts` is a thin compatibility barrel.
- Add and edit modals use one typed field builder instead of duplicating title, status, score, date, progress, unit, genre, template, and favorite controls.
- Architecture checks reject prototype patches, plugin method replacement, direct feature/UI frontmatter persistence, import-time installation, form-discovery observers, and active imports from the legacy barrel.
- Runtime behavior tests replace source-location assertions; static checks remain only where architecture or release artifacts are the behavior under test.

Completion conditions:

- No feature overwrites plugin methods, `fileManager.processFrontMatter`, `Modal.prototype`, or a renderer.
- Add and edit flows share typed form and persistence contracts while preserving existing Markdown/frontmatter data.
- All active TypeScript passes the strict configuration without lint suppressions.
- Full UTC checks, Asia/Taipei tests, release checks, GitHub Actions, and Test Vault validation pass.

Implementation is complete on the feature branch; GitHub Actions and Test Vault remain the merge gates.

## Branch and merge gates

For every stage:

1. Synchronize `preview` with the current stable baseline.
2. Create a stage branch from the exact `preview` SHA.
3. Run the full local validation commands and record results.
4. Push a clean set of responsibility-based commits.
5. Open a Draft PR with `preview` as base.
6. Confirm the latest PR head GitHub Actions jobs succeed.
7. Ask for Test Vault validation.
8. Merge only after explicit approval, using squash merge.
9. Confirm the merged `preview` result and its post-merge CI separately.
