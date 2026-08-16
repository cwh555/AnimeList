# Verification

AnimeList release candidates are verified from the exact Git commit that will be reviewed. This document describes the required verification contract instead of preserving stale timing or test-count snapshots from an older release.

## Required environment

- A clean checkout of the candidate commit.
- The Node.js version used by repository CI or another version supported by `package.json`.
- npm with the committed lockfile.
- Chromium available for the browser regression scripts when they are run outside GitHub Actions.
- A disposable Obsidian Test Vault for the final interactive checks.

## Local release-candidate checks

Run from the repository root:

```bash
npm ci
npm test
npm run check
npm run release:check
```

`npm run check` is the complete repository gate: TypeScript, strict TypeScript, lint, architecture checks, automated tests, Community preflight, reproducible styles, and the production build. `npm run release:check` verifies the currently committed release metadata and release artifacts. `package.json` is the single plugin-version source: use `npm run release:version -- <new-version>` for a release bump, or `npm run version:sync` after manually editing only `package.json`. Derived version fields must not be edited independently.

For browser-sensitive changes, also run the relevant Chromium regressions:

```bash
npm run test:browser:date
npm run test:browser:mobile
npm run test:browser:tags
npm run test:browser:tag-manager
```

## GitHub Actions

The final PR head must pass `.github/workflows/ci.yml` on the exact SHA being reviewed. The workflow independently runs:

```text
npm ci
TZ=UTC npm run check
TZ=Asia/Taipei npm test
segmented-date Chromium regression
responsive mobile Chromium regression
tag-chip Chromium regression
Tag Manager Chromium regression
npm run release:check
```

A successful older SHA is not sufficient after the branch changes. If a validation-only commit is used to obtain a clean final CI run, the final reported workflow must correspond to that new head SHA.

## Community compatibility

The Community preflight must stay free of suppressions and browser-feature workarounds that exceed the minimum supported Obsidian baseline. Release CSS should avoid unsupported or partially supported features when an equivalent baseline layout exists. The current preflight explicitly protects against reintroducing CSS multi-column layout and `scrollbar-width` / `scrollbar-color` into the generated release stylesheet.

## Test Vault

After automated checks pass, run:

```bash
npm run test-vault
```

This installs only `main.js`, `manifest.json`, and `styles.css` into the disposable vault, prepares the controlled fixtures, and opens the manual checklist. The production Test Vault is the final place to verify real Obsidian lifecycle, Markdown rendering, note-media behavior, release tracking, Settings, and desktop/mobile layout.

The automated checks do not replace interactive Test Vault verification. A release candidate should not be merged or published until the manual checklist relevant to the changed features is explicitly approved.
